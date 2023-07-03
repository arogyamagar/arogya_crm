(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var DiffSequence = Package['diff-sequence'].DiffSequence;
var ECMAScript = Package.ecmascript.ECMAScript;
var EJSON = Package.ejson.EJSON;
var GeoJSON = Package['geojson-utils'].GeoJSON;
var IdMap = Package['id-map'].IdMap;
var MongoID = Package['mongo-id'].MongoID;
var OrderedDict = Package['ordered-dict'].OrderedDict;
var Random = Package.random.Random;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var Decimal = Package['mongo-decimal'].Decimal;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var operand, selectorValue, MinimongoTest, MinimongoError, selector, doc, callback, options, oldResults, a, b, LocalCollection, Minimongo;

var require = meteorInstall({"node_modules":{"meteor":{"minimongo":{"minimongo_server.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/minimongo/minimongo_server.js                                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.link("./minimongo_common.js");
let hasOwn, isNumericKey, isOperatorObject, pathsToTree, projectionDetails;
module.link("./common.js", {
  hasOwn(v) {
    hasOwn = v;
  },
  isNumericKey(v) {
    isNumericKey = v;
  },
  isOperatorObject(v) {
    isOperatorObject = v;
  },
  pathsToTree(v) {
    pathsToTree = v;
  },
  projectionDetails(v) {
    projectionDetails = v;
  }
}, 0);
Minimongo._pathsElidingNumericKeys = paths => paths.map(path => path.split('.').filter(part => !isNumericKey(part)).join('.'));

// Returns true if the modifier applied to some document may change the result
// of matching the document by selector
// The modifier is always in a form of Object:
//  - $set
//    - 'a.b.22.z': value
//    - 'foo.bar': 42
//  - $unset
//    - 'abc.d': 1
Minimongo.Matcher.prototype.affectedByModifier = function (modifier) {
  // safe check for $set/$unset being objects
  modifier = Object.assign({
    $set: {},
    $unset: {}
  }, modifier);
  const meaningfulPaths = this._getPaths();
  const modifiedPaths = [].concat(Object.keys(modifier.$set), Object.keys(modifier.$unset));
  return modifiedPaths.some(path => {
    const mod = path.split('.');
    return meaningfulPaths.some(meaningfulPath => {
      const sel = meaningfulPath.split('.');
      let i = 0,
        j = 0;
      while (i < sel.length && j < mod.length) {
        if (isNumericKey(sel[i]) && isNumericKey(mod[j])) {
          // foo.4.bar selector affected by foo.4 modifier
          // foo.3.bar selector unaffected by foo.4 modifier
          if (sel[i] === mod[j]) {
            i++;
            j++;
          } else {
            return false;
          }
        } else if (isNumericKey(sel[i])) {
          // foo.4.bar selector unaffected by foo.bar modifier
          return false;
        } else if (isNumericKey(mod[j])) {
          j++;
        } else if (sel[i] === mod[j]) {
          i++;
          j++;
        } else {
          return false;
        }
      }

      // One is a prefix of another, taking numeric fields into account
      return true;
    });
  });
};

// @param modifier - Object: MongoDB-styled modifier with `$set`s and `$unsets`
//                           only. (assumed to come from oplog)
// @returns - Boolean: if after applying the modifier, selector can start
//                     accepting the modified value.
// NOTE: assumes that document affected by modifier didn't match this Matcher
// before, so if modifier can't convince selector in a positive change it would
// stay 'false'.
// Currently doesn't support $-operators and numeric indices precisely.
Minimongo.Matcher.prototype.canBecomeTrueByModifier = function (modifier) {
  if (!this.affectedByModifier(modifier)) {
    return false;
  }
  if (!this.isSimple()) {
    return true;
  }
  modifier = Object.assign({
    $set: {},
    $unset: {}
  }, modifier);
  const modifierPaths = [].concat(Object.keys(modifier.$set), Object.keys(modifier.$unset));
  if (this._getPaths().some(pathHasNumericKeys) || modifierPaths.some(pathHasNumericKeys)) {
    return true;
  }

  // check if there is a $set or $unset that indicates something is an
  // object rather than a scalar in the actual object where we saw $-operator
  // NOTE: it is correct since we allow only scalars in $-operators
  // Example: for selector {'a.b': {$gt: 5}} the modifier {'a.b.c':7} would
  // definitely set the result to false as 'a.b' appears to be an object.
  const expectedScalarIsObject = Object.keys(this._selector).some(path => {
    if (!isOperatorObject(this._selector[path])) {
      return false;
    }
    return modifierPaths.some(modifierPath => modifierPath.startsWith("".concat(path, ".")));
  });
  if (expectedScalarIsObject) {
    return false;
  }

  // See if we can apply the modifier on the ideally matching object. If it
  // still matches the selector, then the modifier could have turned the real
  // object in the database into something matching.
  const matchingDocument = EJSON.clone(this.matchingDocument());

  // The selector is too complex, anything can happen.
  if (matchingDocument === null) {
    return true;
  }
  try {
    LocalCollection._modify(matchingDocument, modifier);
  } catch (error) {
    // Couldn't set a property on a field which is a scalar or null in the
    // selector.
    // Example:
    // real document: { 'a.b': 3 }
    // selector: { 'a': 12 }
    // converted selector (ideal document): { 'a': 12 }
    // modifier: { $set: { 'a.b': 4 } }
    // We don't know what real document was like but from the error raised by
    // $set on a scalar field we can reason that the structure of real document
    // is completely different.
    if (error.name === 'MinimongoError' && error.setPropertyError) {
      return false;
    }
    throw error;
  }
  return this.documentMatches(matchingDocument).result;
};

// Knows how to combine a mongo selector and a fields projection to a new fields
// projection taking into account active fields from the passed selector.
// @returns Object - projection object (same as fields option of mongo cursor)
Minimongo.Matcher.prototype.combineIntoProjection = function (projection) {
  const selectorPaths = Minimongo._pathsElidingNumericKeys(this._getPaths());

  // Special case for $where operator in the selector - projection should depend
  // on all fields of the document. getSelectorPaths returns a list of paths
  // selector depends on. If one of the paths is '' (empty string) representing
  // the root or the whole document, complete projection should be returned.
  if (selectorPaths.includes('')) {
    return {};
  }
  return combineImportantPathsIntoProjection(selectorPaths, projection);
};

// Returns an object that would match the selector if possible or null if the
// selector is too complex for us to analyze
// { 'a.b': { ans: 42 }, 'foo.bar': null, 'foo.baz': "something" }
// => { a: { b: { ans: 42 } }, foo: { bar: null, baz: "something" } }
Minimongo.Matcher.prototype.matchingDocument = function () {
  // check if it was computed before
  if (this._matchingDocument !== undefined) {
    return this._matchingDocument;
  }

  // If the analysis of this selector is too hard for our implementation
  // fallback to "YES"
  let fallback = false;
  this._matchingDocument = pathsToTree(this._getPaths(), path => {
    const valueSelector = this._selector[path];
    if (isOperatorObject(valueSelector)) {
      // if there is a strict equality, there is a good
      // chance we can use one of those as "matching"
      // dummy value
      if (valueSelector.$eq) {
        return valueSelector.$eq;
      }
      if (valueSelector.$in) {
        const matcher = new Minimongo.Matcher({
          placeholder: valueSelector
        });

        // Return anything from $in that matches the whole selector for this
        // path. If nothing matches, returns `undefined` as nothing can make
        // this selector into `true`.
        return valueSelector.$in.find(placeholder => matcher.documentMatches({
          placeholder
        }).result);
      }
      if (onlyContainsKeys(valueSelector, ['$gt', '$gte', '$lt', '$lte'])) {
        let lowerBound = -Infinity;
        let upperBound = Infinity;
        ['$lte', '$lt'].forEach(op => {
          if (hasOwn.call(valueSelector, op) && valueSelector[op] < upperBound) {
            upperBound = valueSelector[op];
          }
        });
        ['$gte', '$gt'].forEach(op => {
          if (hasOwn.call(valueSelector, op) && valueSelector[op] > lowerBound) {
            lowerBound = valueSelector[op];
          }
        });
        const middle = (lowerBound + upperBound) / 2;
        const matcher = new Minimongo.Matcher({
          placeholder: valueSelector
        });
        if (!matcher.documentMatches({
          placeholder: middle
        }).result && (middle === lowerBound || middle === upperBound)) {
          fallback = true;
        }
        return middle;
      }
      if (onlyContainsKeys(valueSelector, ['$nin', '$ne'])) {
        // Since this._isSimple makes sure $nin and $ne are not combined with
        // objects or arrays, we can confidently return an empty object as it
        // never matches any scalar.
        return {};
      }
      fallback = true;
    }
    return this._selector[path];
  }, x => x);
  if (fallback) {
    this._matchingDocument = null;
  }
  return this._matchingDocument;
};

// Minimongo.Sorter gets a similar method, which delegates to a Matcher it made
// for this exact purpose.
Minimongo.Sorter.prototype.affectedByModifier = function (modifier) {
  return this._selectorForAffectedByModifier.affectedByModifier(modifier);
};
Minimongo.Sorter.prototype.combineIntoProjection = function (projection) {
  return combineImportantPathsIntoProjection(Minimongo._pathsElidingNumericKeys(this._getPaths()), projection);
};
function combineImportantPathsIntoProjection(paths, projection) {
  const details = projectionDetails(projection);

  // merge the paths to include
  const tree = pathsToTree(paths, path => true, (node, path, fullPath) => true, details.tree);
  const mergedProjection = treeToPaths(tree);
  if (details.including) {
    // both selector and projection are pointing on fields to include
    // so we can just return the merged tree
    return mergedProjection;
  }

  // selector is pointing at fields to include
  // projection is pointing at fields to exclude
  // make sure we don't exclude important paths
  const mergedExclProjection = {};
  Object.keys(mergedProjection).forEach(path => {
    if (!mergedProjection[path]) {
      mergedExclProjection[path] = false;
    }
  });
  return mergedExclProjection;
}
function getPaths(selector) {
  return Object.keys(new Minimongo.Matcher(selector)._paths);

  // XXX remove it?
  // return Object.keys(selector).map(k => {
  //   // we don't know how to handle $where because it can be anything
  //   if (k === '$where') {
  //     return ''; // matches everything
  //   }

  //   // we branch from $or/$and/$nor operator
  //   if (['$or', '$and', '$nor'].includes(k)) {
  //     return selector[k].map(getPaths);
  //   }

  //   // the value is a literal or some comparison operator
  //   return k;
  // })
  //   .reduce((a, b) => a.concat(b), [])
  //   .filter((a, b, c) => c.indexOf(a) === b);
}

// A helper to ensure object has only certain keys
function onlyContainsKeys(obj, keys) {
  return Object.keys(obj).every(k => keys.includes(k));
}
function pathHasNumericKeys(path) {
  return path.split('.').some(isNumericKey);
}

// Returns a set of key paths similar to
// { 'foo.bar': 1, 'a.b.c': 1 }
function treeToPaths(tree) {
  let prefix = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
  const result = {};
  Object.keys(tree).forEach(key => {
    const value = tree[key];
    if (value === Object(value)) {
      Object.assign(result, treeToPaths(value, "".concat(prefix + key, ".")));
    } else {
      result[prefix + key] = value;
    }
  });
  return result;
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"common.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/minimongo/common.js                                                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  hasOwn: () => hasOwn,
  ELEMENT_OPERATORS: () => ELEMENT_OPERATORS,
  compileDocumentSelector: () => compileDocumentSelector,
  equalityElementMatcher: () => equalityElementMatcher,
  expandArraysInBranches: () => expandArraysInBranches,
  isIndexable: () => isIndexable,
  isNumericKey: () => isNumericKey,
  isOperatorObject: () => isOperatorObject,
  makeLookupFunction: () => makeLookupFunction,
  nothingMatcher: () => nothingMatcher,
  pathsToTree: () => pathsToTree,
  populateDocumentWithQueryFields: () => populateDocumentWithQueryFields,
  projectionDetails: () => projectionDetails,
  regexpElementMatcher: () => regexpElementMatcher
});
let LocalCollection;
module.link("./local_collection.js", {
  default(v) {
    LocalCollection = v;
  }
}, 0);
const hasOwn = Object.prototype.hasOwnProperty;
const ELEMENT_OPERATORS = {
  $lt: makeInequality(cmpValue => cmpValue < 0),
  $gt: makeInequality(cmpValue => cmpValue > 0),
  $lte: makeInequality(cmpValue => cmpValue <= 0),
  $gte: makeInequality(cmpValue => cmpValue >= 0),
  $mod: {
    compileElementSelector(operand) {
      if (!(Array.isArray(operand) && operand.length === 2 && typeof operand[0] === 'number' && typeof operand[1] === 'number')) {
        throw Error('argument to $mod must be an array of two numbers');
      }

      // XXX could require to be ints or round or something
      const divisor = operand[0];
      const remainder = operand[1];
      return value => typeof value === 'number' && value % divisor === remainder;
    }
  },
  $in: {
    compileElementSelector(operand) {
      if (!Array.isArray(operand)) {
        throw Error('$in needs an array');
      }
      const elementMatchers = operand.map(option => {
        if (option instanceof RegExp) {
          return regexpElementMatcher(option);
        }
        if (isOperatorObject(option)) {
          throw Error('cannot nest $ under $in');
        }
        return equalityElementMatcher(option);
      });
      return value => {
        // Allow {a: {$in: [null]}} to match when 'a' does not exist.
        if (value === undefined) {
          value = null;
        }
        return elementMatchers.some(matcher => matcher(value));
      };
    }
  },
  $size: {
    // {a: [[5, 5]]} must match {a: {$size: 1}} but not {a: {$size: 2}}, so we
    // don't want to consider the element [5,5] in the leaf array [[5,5]] as a
    // possible value.
    dontExpandLeafArrays: true,
    compileElementSelector(operand) {
      if (typeof operand === 'string') {
        // Don't ask me why, but by experimentation, this seems to be what Mongo
        // does.
        operand = 0;
      } else if (typeof operand !== 'number') {
        throw Error('$size needs a number');
      }
      return value => Array.isArray(value) && value.length === operand;
    }
  },
  $type: {
    // {a: [5]} must not match {a: {$type: 4}} (4 means array), but it should
    // match {a: {$type: 1}} (1 means number), and {a: [[5]]} must match {$a:
    // {$type: 4}}. Thus, when we see a leaf array, we *should* expand it but
    // should *not* include it itself.
    dontIncludeLeafArrays: true,
    compileElementSelector(operand) {
      if (typeof operand === 'string') {
        const operandAliasMap = {
          'double': 1,
          'string': 2,
          'object': 3,
          'array': 4,
          'binData': 5,
          'undefined': 6,
          'objectId': 7,
          'bool': 8,
          'date': 9,
          'null': 10,
          'regex': 11,
          'dbPointer': 12,
          'javascript': 13,
          'symbol': 14,
          'javascriptWithScope': 15,
          'int': 16,
          'timestamp': 17,
          'long': 18,
          'decimal': 19,
          'minKey': -1,
          'maxKey': 127
        };
        if (!hasOwn.call(operandAliasMap, operand)) {
          throw Error("unknown string alias for $type: ".concat(operand));
        }
        operand = operandAliasMap[operand];
      } else if (typeof operand === 'number') {
        if (operand === 0 || operand < -1 || operand > 19 && operand !== 127) {
          throw Error("Invalid numerical $type code: ".concat(operand));
        }
      } else {
        throw Error('argument to $type is not a number or a string');
      }
      return value => value !== undefined && LocalCollection._f._type(value) === operand;
    }
  },
  $bitsAllSet: {
    compileElementSelector(operand) {
      const mask = getOperandBitmask(operand, '$bitsAllSet');
      return value => {
        const bitmask = getValueBitmask(value, mask.length);
        return bitmask && mask.every((byte, i) => (bitmask[i] & byte) === byte);
      };
    }
  },
  $bitsAnySet: {
    compileElementSelector(operand) {
      const mask = getOperandBitmask(operand, '$bitsAnySet');
      return value => {
        const bitmask = getValueBitmask(value, mask.length);
        return bitmask && mask.some((byte, i) => (~bitmask[i] & byte) !== byte);
      };
    }
  },
  $bitsAllClear: {
    compileElementSelector(operand) {
      const mask = getOperandBitmask(operand, '$bitsAllClear');
      return value => {
        const bitmask = getValueBitmask(value, mask.length);
        return bitmask && mask.every((byte, i) => !(bitmask[i] & byte));
      };
    }
  },
  $bitsAnyClear: {
    compileElementSelector(operand) {
      const mask = getOperandBitmask(operand, '$bitsAnyClear');
      return value => {
        const bitmask = getValueBitmask(value, mask.length);
        return bitmask && mask.some((byte, i) => (bitmask[i] & byte) !== byte);
      };
    }
  },
  $regex: {
    compileElementSelector(operand, valueSelector) {
      if (!(typeof operand === 'string' || operand instanceof RegExp)) {
        throw Error('$regex has to be a string or RegExp');
      }
      let regexp;
      if (valueSelector.$options !== undefined) {
        // Options passed in $options (even the empty string) always overrides
        // options in the RegExp object itself.

        // Be clear that we only support the JS-supported options, not extended
        // ones (eg, Mongo supports x and s). Ideally we would implement x and s
        // by transforming the regexp, but not today...
        if (/[^gim]/.test(valueSelector.$options)) {
          throw new Error('Only the i, m, and g regexp options are supported');
        }
        const source = operand instanceof RegExp ? operand.source : operand;
        regexp = new RegExp(source, valueSelector.$options);
      } else if (operand instanceof RegExp) {
        regexp = operand;
      } else {
        regexp = new RegExp(operand);
      }
      return regexpElementMatcher(regexp);
    }
  },
  $elemMatch: {
    dontExpandLeafArrays: true,
    compileElementSelector(operand, valueSelector, matcher) {
      if (!LocalCollection._isPlainObject(operand)) {
        throw Error('$elemMatch need an object');
      }
      const isDocMatcher = !isOperatorObject(Object.keys(operand).filter(key => !hasOwn.call(LOGICAL_OPERATORS, key)).reduce((a, b) => Object.assign(a, {
        [b]: operand[b]
      }), {}), true);
      let subMatcher;
      if (isDocMatcher) {
        // This is NOT the same as compileValueSelector(operand), and not just
        // because of the slightly different calling convention.
        // {$elemMatch: {x: 3}} means "an element has a field x:3", not
        // "consists only of a field x:3". Also, regexps and sub-$ are allowed.
        subMatcher = compileDocumentSelector(operand, matcher, {
          inElemMatch: true
        });
      } else {
        subMatcher = compileValueSelector(operand, matcher);
      }
      return value => {
        if (!Array.isArray(value)) {
          return false;
        }
        for (let i = 0; i < value.length; ++i) {
          const arrayElement = value[i];
          let arg;
          if (isDocMatcher) {
            // We can only match {$elemMatch: {b: 3}} against objects.
            // (We can also match against arrays, if there's numeric indices,
            // eg {$elemMatch: {'0.b': 3}} or {$elemMatch: {0: 3}}.)
            if (!isIndexable(arrayElement)) {
              return false;
            }
            arg = arrayElement;
          } else {
            // dontIterate ensures that {a: {$elemMatch: {$gt: 5}}} matches
            // {a: [8]} but not {a: [[8]]}
            arg = [{
              value: arrayElement,
              dontIterate: true
            }];
          }
          // XXX support $near in $elemMatch by propagating $distance?
          if (subMatcher(arg).result) {
            return i; // specially understood to mean "use as arrayIndices"
          }
        }

        return false;
      };
    }
  }
};
// Operators that appear at the top level of a document selector.
const LOGICAL_OPERATORS = {
  $and(subSelector, matcher, inElemMatch) {
    return andDocumentMatchers(compileArrayOfDocumentSelectors(subSelector, matcher, inElemMatch));
  },
  $or(subSelector, matcher, inElemMatch) {
    const matchers = compileArrayOfDocumentSelectors(subSelector, matcher, inElemMatch);

    // Special case: if there is only one matcher, use it directly, *preserving*
    // any arrayIndices it returns.
    if (matchers.length === 1) {
      return matchers[0];
    }
    return doc => {
      const result = matchers.some(fn => fn(doc).result);
      // $or does NOT set arrayIndices when it has multiple
      // sub-expressions. (Tested against MongoDB.)
      return {
        result
      };
    };
  },
  $nor(subSelector, matcher, inElemMatch) {
    const matchers = compileArrayOfDocumentSelectors(subSelector, matcher, inElemMatch);
    return doc => {
      const result = matchers.every(fn => !fn(doc).result);
      // Never set arrayIndices, because we only match if nothing in particular
      // 'matched' (and because this is consistent with MongoDB).
      return {
        result
      };
    };
  },
  $where(selectorValue, matcher) {
    // Record that *any* path may be used.
    matcher._recordPathUsed('');
    matcher._hasWhere = true;
    if (!(selectorValue instanceof Function)) {
      // XXX MongoDB seems to have more complex logic to decide where or or not
      // to add 'return'; not sure exactly what it is.
      selectorValue = Function('obj', "return ".concat(selectorValue));
    }

    // We make the document available as both `this` and `obj`.
    // // XXX not sure what we should do if this throws
    return doc => ({
      result: selectorValue.call(doc, doc)
    });
  },
  // This is just used as a comment in the query (in MongoDB, it also ends up in
  // query logs); it has no effect on the actual selection.
  $comment() {
    return () => ({
      result: true
    });
  }
};

// Operators that (unlike LOGICAL_OPERATORS) pertain to individual paths in a
// document, but (unlike ELEMENT_OPERATORS) do not have a simple definition as
// "match each branched value independently and combine with
// convertElementMatcherToBranchedMatcher".
const VALUE_OPERATORS = {
  $eq(operand) {
    return convertElementMatcherToBranchedMatcher(equalityElementMatcher(operand));
  },
  $not(operand, valueSelector, matcher) {
    return invertBranchedMatcher(compileValueSelector(operand, matcher));
  },
  $ne(operand) {
    return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(equalityElementMatcher(operand)));
  },
  $nin(operand) {
    return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(ELEMENT_OPERATORS.$in.compileElementSelector(operand)));
  },
  $exists(operand) {
    const exists = convertElementMatcherToBranchedMatcher(value => value !== undefined);
    return operand ? exists : invertBranchedMatcher(exists);
  },
  // $options just provides options for $regex; its logic is inside $regex
  $options(operand, valueSelector) {
    if (!hasOwn.call(valueSelector, '$regex')) {
      throw Error('$options needs a $regex');
    }
    return everythingMatcher;
  },
  // $maxDistance is basically an argument to $near
  $maxDistance(operand, valueSelector) {
    if (!valueSelector.$near) {
      throw Error('$maxDistance needs a $near');
    }
    return everythingMatcher;
  },
  $all(operand, valueSelector, matcher) {
    if (!Array.isArray(operand)) {
      throw Error('$all requires array');
    }

    // Not sure why, but this seems to be what MongoDB does.
    if (operand.length === 0) {
      return nothingMatcher;
    }
    const branchedMatchers = operand.map(criterion => {
      // XXX handle $all/$elemMatch combination
      if (isOperatorObject(criterion)) {
        throw Error('no $ expressions in $all');
      }

      // This is always a regexp or equality selector.
      return compileValueSelector(criterion, matcher);
    });

    // andBranchedMatchers does NOT require all selectors to return true on the
    // SAME branch.
    return andBranchedMatchers(branchedMatchers);
  },
  $near(operand, valueSelector, matcher, isRoot) {
    if (!isRoot) {
      throw Error('$near can\'t be inside another $ operator');
    }
    matcher._hasGeoQuery = true;

    // There are two kinds of geodata in MongoDB: legacy coordinate pairs and
    // GeoJSON. They use different distance metrics, too. GeoJSON queries are
    // marked with a $geometry property, though legacy coordinates can be
    // matched using $geometry.
    let maxDistance, point, distance;
    if (LocalCollection._isPlainObject(operand) && hasOwn.call(operand, '$geometry')) {
      // GeoJSON "2dsphere" mode.
      maxDistance = operand.$maxDistance;
      point = operand.$geometry;
      distance = value => {
        // XXX: for now, we don't calculate the actual distance between, say,
        // polygon and circle. If people care about this use-case it will get
        // a priority.
        if (!value) {
          return null;
        }
        if (!value.type) {
          return GeoJSON.pointDistance(point, {
            type: 'Point',
            coordinates: pointToArray(value)
          });
        }
        if (value.type === 'Point') {
          return GeoJSON.pointDistance(point, value);
        }
        return GeoJSON.geometryWithinRadius(value, point, maxDistance) ? 0 : maxDistance + 1;
      };
    } else {
      maxDistance = valueSelector.$maxDistance;
      if (!isIndexable(operand)) {
        throw Error('$near argument must be coordinate pair or GeoJSON');
      }
      point = pointToArray(operand);
      distance = value => {
        if (!isIndexable(value)) {
          return null;
        }
        return distanceCoordinatePairs(point, value);
      };
    }
    return branchedValues => {
      // There might be multiple points in the document that match the given
      // field. Only one of them needs to be within $maxDistance, but we need to
      // evaluate all of them and use the nearest one for the implicit sort
      // specifier. (That's why we can't just use ELEMENT_OPERATORS here.)
      //
      // Note: This differs from MongoDB's implementation, where a document will
      // actually show up *multiple times* in the result set, with one entry for
      // each within-$maxDistance branching point.
      const result = {
        result: false
      };
      expandArraysInBranches(branchedValues).every(branch => {
        // if operation is an update, don't skip branches, just return the first
        // one (#3599)
        let curDistance;
        if (!matcher._isUpdate) {
          if (!(typeof branch.value === 'object')) {
            return true;
          }
          curDistance = distance(branch.value);

          // Skip branches that aren't real points or are too far away.
          if (curDistance === null || curDistance > maxDistance) {
            return true;
          }

          // Skip anything that's a tie.
          if (result.distance !== undefined && result.distance <= curDistance) {
            return true;
          }
        }
        result.result = true;
        result.distance = curDistance;
        if (branch.arrayIndices) {
          result.arrayIndices = branch.arrayIndices;
        } else {
          delete result.arrayIndices;
        }
        return !matcher._isUpdate;
      });
      return result;
    };
  }
};

// NB: We are cheating and using this function to implement 'AND' for both
// 'document matchers' and 'branched matchers'. They both return result objects
// but the argument is different: for the former it's a whole doc, whereas for
// the latter it's an array of 'branched values'.
function andSomeMatchers(subMatchers) {
  if (subMatchers.length === 0) {
    return everythingMatcher;
  }
  if (subMatchers.length === 1) {
    return subMatchers[0];
  }
  return docOrBranches => {
    const match = {};
    match.result = subMatchers.every(fn => {
      const subResult = fn(docOrBranches);

      // Copy a 'distance' number out of the first sub-matcher that has
      // one. Yes, this means that if there are multiple $near fields in a
      // query, something arbitrary happens; this appears to be consistent with
      // Mongo.
      if (subResult.result && subResult.distance !== undefined && match.distance === undefined) {
        match.distance = subResult.distance;
      }

      // Similarly, propagate arrayIndices from sub-matchers... but to match
      // MongoDB behavior, this time the *last* sub-matcher with arrayIndices
      // wins.
      if (subResult.result && subResult.arrayIndices) {
        match.arrayIndices = subResult.arrayIndices;
      }
      return subResult.result;
    });

    // If we didn't actually match, forget any extra metadata we came up with.
    if (!match.result) {
      delete match.distance;
      delete match.arrayIndices;
    }
    return match;
  };
}
const andDocumentMatchers = andSomeMatchers;
const andBranchedMatchers = andSomeMatchers;
function compileArrayOfDocumentSelectors(selectors, matcher, inElemMatch) {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    throw Error('$and/$or/$nor must be nonempty array');
  }
  return selectors.map(subSelector => {
    if (!LocalCollection._isPlainObject(subSelector)) {
      throw Error('$or/$and/$nor entries need to be full objects');
    }
    return compileDocumentSelector(subSelector, matcher, {
      inElemMatch
    });
  });
}

// Takes in a selector that could match a full document (eg, the original
// selector). Returns a function mapping document->result object.
//
// matcher is the Matcher object we are compiling.
//
// If this is the root document selector (ie, not wrapped in $and or the like),
// then isRoot is true. (This is used by $near.)
function compileDocumentSelector(docSelector, matcher) {
  let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  const docMatchers = Object.keys(docSelector).map(key => {
    const subSelector = docSelector[key];
    if (key.substr(0, 1) === '$') {
      // Outer operators are either logical operators (they recurse back into
      // this function), or $where.
      if (!hasOwn.call(LOGICAL_OPERATORS, key)) {
        throw new Error("Unrecognized logical operator: ".concat(key));
      }
      matcher._isSimple = false;
      return LOGICAL_OPERATORS[key](subSelector, matcher, options.inElemMatch);
    }

    // Record this path, but only if we aren't in an elemMatcher, since in an
    // elemMatch this is a path inside an object in an array, not in the doc
    // root.
    if (!options.inElemMatch) {
      matcher._recordPathUsed(key);
    }

    // Don't add a matcher if subSelector is a function -- this is to match
    // the behavior of Meteor on the server (inherited from the node mongodb
    // driver), which is to ignore any part of a selector which is a function.
    if (typeof subSelector === 'function') {
      return undefined;
    }
    const lookUpByIndex = makeLookupFunction(key);
    const valueMatcher = compileValueSelector(subSelector, matcher, options.isRoot);
    return doc => valueMatcher(lookUpByIndex(doc));
  }).filter(Boolean);
  return andDocumentMatchers(docMatchers);
}
// Takes in a selector that could match a key-indexed value in a document; eg,
// {$gt: 5, $lt: 9}, or a regular expression, or any non-expression object (to
// indicate equality).  Returns a branched matcher: a function mapping
// [branched value]->result object.
function compileValueSelector(valueSelector, matcher, isRoot) {
  if (valueSelector instanceof RegExp) {
    matcher._isSimple = false;
    return convertElementMatcherToBranchedMatcher(regexpElementMatcher(valueSelector));
  }
  if (isOperatorObject(valueSelector)) {
    return operatorBranchedMatcher(valueSelector, matcher, isRoot);
  }
  return convertElementMatcherToBranchedMatcher(equalityElementMatcher(valueSelector));
}

// Given an element matcher (which evaluates a single value), returns a branched
// value (which evaluates the element matcher on all the branches and returns a
// more structured return value possibly including arrayIndices).
function convertElementMatcherToBranchedMatcher(elementMatcher) {
  let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  return branches => {
    const expanded = options.dontExpandLeafArrays ? branches : expandArraysInBranches(branches, options.dontIncludeLeafArrays);
    const match = {};
    match.result = expanded.some(element => {
      let matched = elementMatcher(element.value);

      // Special case for $elemMatch: it means "true, and use this as an array
      // index if I didn't already have one".
      if (typeof matched === 'number') {
        // XXX This code dates from when we only stored a single array index
        // (for the outermost array). Should we be also including deeper array
        // indices from the $elemMatch match?
        if (!element.arrayIndices) {
          element.arrayIndices = [matched];
        }
        matched = true;
      }

      // If some element matched, and it's tagged with array indices, include
      // those indices in our result object.
      if (matched && element.arrayIndices) {
        match.arrayIndices = element.arrayIndices;
      }
      return matched;
    });
    return match;
  };
}

// Helpers for $near.
function distanceCoordinatePairs(a, b) {
  const pointA = pointToArray(a);
  const pointB = pointToArray(b);
  return Math.hypot(pointA[0] - pointB[0], pointA[1] - pointB[1]);
}

// Takes something that is not an operator object and returns an element matcher
// for equality with that thing.
function equalityElementMatcher(elementSelector) {
  if (isOperatorObject(elementSelector)) {
    throw Error('Can\'t create equalityValueSelector for operator object');
  }

  // Special-case: null and undefined are equal (if you got undefined in there
  // somewhere, or if you got it due to some branch being non-existent in the
  // weird special case), even though they aren't with EJSON.equals.
  // undefined or null
  if (elementSelector == null) {
    return value => value == null;
  }
  return value => LocalCollection._f._equal(elementSelector, value);
}
function everythingMatcher(docOrBranchedValues) {
  return {
    result: true
  };
}
function expandArraysInBranches(branches, skipTheArrays) {
  const branchesOut = [];
  branches.forEach(branch => {
    const thisIsArray = Array.isArray(branch.value);

    // We include the branch itself, *UNLESS* we it's an array that we're going
    // to iterate and we're told to skip arrays.  (That's right, we include some
    // arrays even skipTheArrays is true: these are arrays that were found via
    // explicit numerical indices.)
    if (!(skipTheArrays && thisIsArray && !branch.dontIterate)) {
      branchesOut.push({
        arrayIndices: branch.arrayIndices,
        value: branch.value
      });
    }
    if (thisIsArray && !branch.dontIterate) {
      branch.value.forEach((value, i) => {
        branchesOut.push({
          arrayIndices: (branch.arrayIndices || []).concat(i),
          value
        });
      });
    }
  });
  return branchesOut;
}
// Helpers for $bitsAllSet/$bitsAnySet/$bitsAllClear/$bitsAnyClear.
function getOperandBitmask(operand, selector) {
  // numeric bitmask
  // You can provide a numeric bitmask to be matched against the operand field.
  // It must be representable as a non-negative 32-bit signed integer.
  // Otherwise, $bitsAllSet will return an error.
  if (Number.isInteger(operand) && operand >= 0) {
    return new Uint8Array(new Int32Array([operand]).buffer);
  }

  // bindata bitmask
  // You can also use an arbitrarily large BinData instance as a bitmask.
  if (EJSON.isBinary(operand)) {
    return new Uint8Array(operand.buffer);
  }

  // position list
  // If querying a list of bit positions, each <position> must be a non-negative
  // integer. Bit positions start at 0 from the least significant bit.
  if (Array.isArray(operand) && operand.every(x => Number.isInteger(x) && x >= 0)) {
    const buffer = new ArrayBuffer((Math.max(...operand) >> 3) + 1);
    const view = new Uint8Array(buffer);
    operand.forEach(x => {
      view[x >> 3] |= 1 << (x & 0x7);
    });
    return view;
  }

  // bad operand
  throw Error("operand to ".concat(selector, " must be a numeric bitmask (representable as a ") + 'non-negative 32-bit signed integer), a bindata bitmask or an array with ' + 'bit positions (non-negative integers)');
}
function getValueBitmask(value, length) {
  // The field value must be either numerical or a BinData instance. Otherwise,
  // $bits... will not match the current document.

  // numerical
  if (Number.isSafeInteger(value)) {
    // $bits... will not match numerical values that cannot be represented as a
    // signed 64-bit integer. This can be the case if a value is either too
    // large or small to fit in a signed 64-bit integer, or if it has a
    // fractional component.
    const buffer = new ArrayBuffer(Math.max(length, 2 * Uint32Array.BYTES_PER_ELEMENT));
    let view = new Uint32Array(buffer, 0, 2);
    view[0] = value % ((1 << 16) * (1 << 16)) | 0;
    view[1] = value / ((1 << 16) * (1 << 16)) | 0;

    // sign extension
    if (value < 0) {
      view = new Uint8Array(buffer, 2);
      view.forEach((byte, i) => {
        view[i] = 0xff;
      });
    }
    return new Uint8Array(buffer);
  }

  // bindata
  if (EJSON.isBinary(value)) {
    return new Uint8Array(value.buffer);
  }

  // no match
  return false;
}

// Actually inserts a key value into the selector document
// However, this checks there is no ambiguity in setting
// the value for the given key, throws otherwise
function insertIntoDocument(document, key, value) {
  Object.keys(document).forEach(existingKey => {
    if (existingKey.length > key.length && existingKey.indexOf("".concat(key, ".")) === 0 || key.length > existingKey.length && key.indexOf("".concat(existingKey, ".")) === 0) {
      throw new Error("cannot infer query fields to set, both paths '".concat(existingKey, "' and ") + "'".concat(key, "' are matched"));
    } else if (existingKey === key) {
      throw new Error("cannot infer query fields to set, path '".concat(key, "' is matched twice"));
    }
  });
  document[key] = value;
}

// Returns a branched matcher that matches iff the given matcher does not.
// Note that this implicitly "deMorganizes" the wrapped function.  ie, it
// means that ALL branch values need to fail to match innerBranchedMatcher.
function invertBranchedMatcher(branchedMatcher) {
  return branchValues => {
    // We explicitly choose to strip arrayIndices here: it doesn't make sense to
    // say "update the array element that does not match something", at least
    // in mongo-land.
    return {
      result: !branchedMatcher(branchValues).result
    };
  };
}
function isIndexable(obj) {
  return Array.isArray(obj) || LocalCollection._isPlainObject(obj);
}
function isNumericKey(s) {
  return /^[0-9]+$/.test(s);
}
function isOperatorObject(valueSelector, inconsistentOK) {
  if (!LocalCollection._isPlainObject(valueSelector)) {
    return false;
  }
  let theseAreOperators = undefined;
  Object.keys(valueSelector).forEach(selKey => {
    const thisIsOperator = selKey.substr(0, 1) === '$' || selKey === 'diff';
    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      if (!inconsistentOK) {
        throw new Error("Inconsistent operator: ".concat(JSON.stringify(valueSelector)));
      }
      theseAreOperators = false;
    }
  });
  return !!theseAreOperators; // {} has no operators
}

// Helper for $lt/$gt/$lte/$gte.
function makeInequality(cmpValueComparator) {
  return {
    compileElementSelector(operand) {
      // Arrays never compare false with non-arrays for any inequality.
      // XXX This was behavior we observed in pre-release MongoDB 2.5, but
      //     it seems to have been reverted.
      //     See https://jira.mongodb.org/browse/SERVER-11444
      if (Array.isArray(operand)) {
        return () => false;
      }

      // Special case: consider undefined and null the same (so true with
      // $gte/$lte).
      if (operand === undefined) {
        operand = null;
      }
      const operandType = LocalCollection._f._type(operand);
      return value => {
        if (value === undefined) {
          value = null;
        }

        // Comparisons are never true among things of different type (except
        // null vs undefined).
        if (LocalCollection._f._type(value) !== operandType) {
          return false;
        }
        return cmpValueComparator(LocalCollection._f._cmp(value, operand));
      };
    }
  };
}

// makeLookupFunction(key) returns a lookup function.
//
// A lookup function takes in a document and returns an array of matching
// branches.  If no arrays are found while looking up the key, this array will
// have exactly one branches (possibly 'undefined', if some segment of the key
// was not found).
//
// If arrays are found in the middle, this can have more than one element, since
// we 'branch'. When we 'branch', if there are more key segments to look up,
// then we only pursue branches that are plain objects (not arrays or scalars).
// This means we can actually end up with no branches!
//
// We do *NOT* branch on arrays that are found at the end (ie, at the last
// dotted member of the key). We just return that array; if you want to
// effectively 'branch' over the array's values, post-process the lookup
// function with expandArraysInBranches.
//
// Each branch is an object with keys:
//  - value: the value at the branch
//  - dontIterate: an optional bool; if true, it means that 'value' is an array
//    that expandArraysInBranches should NOT expand. This specifically happens
//    when there is a numeric index in the key, and ensures the
//    perhaps-surprising MongoDB behavior where {'a.0': 5} does NOT
//    match {a: [[5]]}.
//  - arrayIndices: if any array indexing was done during lookup (either due to
//    explicit numeric indices or implicit branching), this will be an array of
//    the array indices used, from outermost to innermost; it is falsey or
//    absent if no array index is used. If an explicit numeric index is used,
//    the index will be followed in arrayIndices by the string 'x'.
//
//    Note: arrayIndices is used for two purposes. First, it is used to
//    implement the '$' modifier feature, which only ever looks at its first
//    element.
//
//    Second, it is used for sort key generation, which needs to be able to tell
//    the difference between different paths. Moreover, it needs to
//    differentiate between explicit and implicit branching, which is why
//    there's the somewhat hacky 'x' entry: this means that explicit and
//    implicit array lookups will have different full arrayIndices paths. (That
//    code only requires that different paths have different arrayIndices; it
//    doesn't actually 'parse' arrayIndices. As an alternative, arrayIndices
//    could contain objects with flags like 'implicit', but I think that only
//    makes the code surrounding them more complex.)
//
//    (By the way, this field ends up getting passed around a lot without
//    cloning, so never mutate any arrayIndices field/var in this package!)
//
//
// At the top level, you may only pass in a plain object or array.
//
// See the test 'minimongo - lookup' for some examples of what lookup functions
// return.
function makeLookupFunction(key) {
  let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  const parts = key.split('.');
  const firstPart = parts.length ? parts[0] : '';
  const lookupRest = parts.length > 1 && makeLookupFunction(parts.slice(1).join('.'), options);
  function buildResult(arrayIndices, dontIterate, value) {
    return arrayIndices && arrayIndices.length ? dontIterate ? [{
      arrayIndices,
      dontIterate,
      value
    }] : [{
      arrayIndices,
      value
    }] : dontIterate ? [{
      dontIterate,
      value
    }] : [{
      value
    }];
  }

  // Doc will always be a plain object or an array.
  // apply an explicit numeric index, an array.
  return (doc, arrayIndices) => {
    if (Array.isArray(doc)) {
      // If we're being asked to do an invalid lookup into an array (non-integer
      // or out-of-bounds), return no results (which is different from returning
      // a single undefined result, in that `null` equality checks won't match).
      if (!(isNumericKey(firstPart) && firstPart < doc.length)) {
        return [];
      }

      // Remember that we used this array index. Include an 'x' to indicate that
      // the previous index came from being considered as an explicit array
      // index (not branching).
      arrayIndices = arrayIndices ? arrayIndices.concat(+firstPart, 'x') : [+firstPart, 'x'];
    }

    // Do our first lookup.
    const firstLevel = doc[firstPart];

    // If there is no deeper to dig, return what we found.
    //
    // If what we found is an array, most value selectors will choose to treat
    // the elements of the array as matchable values in their own right, but
    // that's done outside of the lookup function. (Exceptions to this are $size
    // and stuff relating to $elemMatch.  eg, {a: {$size: 2}} does not match {a:
    // [[1, 2]]}.)
    //
    // That said, if we just did an *explicit* array lookup (on doc) to find
    // firstLevel, and firstLevel is an array too, we do NOT want value
    // selectors to iterate over it.  eg, {'a.0': 5} does not match {a: [[5]]}.
    // So in that case, we mark the return value as 'don't iterate'.
    if (!lookupRest) {
      return buildResult(arrayIndices, Array.isArray(doc) && Array.isArray(firstLevel), firstLevel);
    }

    // We need to dig deeper.  But if we can't, because what we've found is not
    // an array or plain object, we're done. If we just did a numeric index into
    // an array, we return nothing here (this is a change in Mongo 2.5 from
    // Mongo 2.4, where {'a.0.b': null} stopped matching {a: [5]}). Otherwise,
    // return a single `undefined` (which can, for example, match via equality
    // with `null`).
    if (!isIndexable(firstLevel)) {
      if (Array.isArray(doc)) {
        return [];
      }
      return buildResult(arrayIndices, false, undefined);
    }
    const result = [];
    const appendToResult = more => {
      result.push(...more);
    };

    // Dig deeper: look up the rest of the parts on whatever we've found.
    // (lookupRest is smart enough to not try to do invalid lookups into
    // firstLevel if it's an array.)
    appendToResult(lookupRest(firstLevel, arrayIndices));

    // If we found an array, then in *addition* to potentially treating the next
    // part as a literal integer lookup, we should also 'branch': try to look up
    // the rest of the parts on each array element in parallel.
    //
    // In this case, we *only* dig deeper into array elements that are plain
    // objects. (Recall that we only got this far if we have further to dig.)
    // This makes sense: we certainly don't dig deeper into non-indexable
    // objects. And it would be weird to dig into an array: it's simpler to have
    // a rule that explicit integer indexes only apply to an outer array, not to
    // an array you find after a branching search.
    //
    // In the special case of a numeric part in a *sort selector* (not a query
    // selector), we skip the branching: we ONLY allow the numeric part to mean
    // 'look up this index' in that case, not 'also look up this index in all
    // the elements of the array'.
    if (Array.isArray(firstLevel) && !(isNumericKey(parts[1]) && options.forSort)) {
      firstLevel.forEach((branch, arrayIndex) => {
        if (LocalCollection._isPlainObject(branch)) {
          appendToResult(lookupRest(branch, arrayIndices ? arrayIndices.concat(arrayIndex) : [arrayIndex]));
        }
      });
    }
    return result;
  };
}
// Object exported only for unit testing.
// Use it to export private functions to test in Tinytest.
MinimongoTest = {
  makeLookupFunction
};
MinimongoError = function (message) {
  let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  if (typeof message === 'string' && options.field) {
    message += " for field '".concat(options.field, "'");
  }
  const error = new Error(message);
  error.name = 'MinimongoError';
  return error;
};
function nothingMatcher(docOrBranchedValues) {
  return {
    result: false
  };
}
// Takes an operator object (an object with $ keys) and returns a branched
// matcher for it.
function operatorBranchedMatcher(valueSelector, matcher, isRoot) {
  // Each valueSelector works separately on the various branches.  So one
  // operator can match one branch and another can match another branch.  This
  // is OK.
  const operatorMatchers = Object.keys(valueSelector).map(operator => {
    const operand = valueSelector[operator];
    const simpleRange = ['$lt', '$lte', '$gt', '$gte'].includes(operator) && typeof operand === 'number';
    const simpleEquality = ['$ne', '$eq'].includes(operator) && operand !== Object(operand);
    const simpleInclusion = ['$in', '$nin'].includes(operator) && Array.isArray(operand) && !operand.some(x => x === Object(x));
    if (!(simpleRange || simpleInclusion || simpleEquality)) {
      matcher._isSimple = false;
    }
    if (hasOwn.call(VALUE_OPERATORS, operator)) {
      return VALUE_OPERATORS[operator](operand, valueSelector, matcher, isRoot);
    }
    if (hasOwn.call(ELEMENT_OPERATORS, operator)) {
      const options = ELEMENT_OPERATORS[operator];
      return convertElementMatcherToBranchedMatcher(options.compileElementSelector(operand, valueSelector, matcher), options);
    }
    throw new Error("Unrecognized operator: ".concat(operator));
  });
  return andBranchedMatchers(operatorMatchers);
}

// paths - Array: list of mongo style paths
// newLeafFn - Function: of form function(path) should return a scalar value to
//                       put into list created for that path
// conflictFn - Function: of form function(node, path, fullPath) is called
//                        when building a tree path for 'fullPath' node on
//                        'path' was already a leaf with a value. Must return a
//                        conflict resolution.
// initial tree - Optional Object: starting tree.
// @returns - Object: tree represented as a set of nested objects
function pathsToTree(paths, newLeafFn, conflictFn) {
  let root = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
  paths.forEach(path => {
    const pathArray = path.split('.');
    let tree = root;

    // use .every just for iteration with break
    const success = pathArray.slice(0, -1).every((key, i) => {
      if (!hasOwn.call(tree, key)) {
        tree[key] = {};
      } else if (tree[key] !== Object(tree[key])) {
        tree[key] = conflictFn(tree[key], pathArray.slice(0, i + 1).join('.'), path);

        // break out of loop if we are failing for this path
        if (tree[key] !== Object(tree[key])) {
          return false;
        }
      }
      tree = tree[key];
      return true;
    });
    if (success) {
      const lastKey = pathArray[pathArray.length - 1];
      if (hasOwn.call(tree, lastKey)) {
        tree[lastKey] = conflictFn(tree[lastKey], path, path);
      } else {
        tree[lastKey] = newLeafFn(path);
      }
    }
  });
  return root;
}
// Makes sure we get 2 elements array and assume the first one to be x and
// the second one to y no matter what user passes.
// In case user passes { lon: x, lat: y } returns [x, y]
function pointToArray(point) {
  return Array.isArray(point) ? point.slice() : [point.x, point.y];
}

// Creating a document from an upsert is quite tricky.
// E.g. this selector: {"$or": [{"b.foo": {"$all": ["bar"]}}]}, should result
// in: {"b.foo": "bar"}
// But this selector: {"$or": [{"b": {"foo": {"$all": ["bar"]}}}]} should throw
// an error

// Some rules (found mainly with trial & error, so there might be more):
// - handle all childs of $and (or implicit $and)
// - handle $or nodes with exactly 1 child
// - ignore $or nodes with more than 1 child
// - ignore $nor and $not nodes
// - throw when a value can not be set unambiguously
// - every value for $all should be dealt with as separate $eq-s
// - threat all children of $all as $eq setters (=> set if $all.length === 1,
//   otherwise throw error)
// - you can not mix '$'-prefixed keys and non-'$'-prefixed keys
// - you can only have dotted keys on a root-level
// - you can not have '$'-prefixed keys more than one-level deep in an object

// Handles one key/value pair to put in the selector document
function populateDocumentWithKeyValue(document, key, value) {
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    populateDocumentWithObject(document, key, value);
  } else if (!(value instanceof RegExp)) {
    insertIntoDocument(document, key, value);
  }
}

// Handles a key, value pair to put in the selector document
// if the value is an object
function populateDocumentWithObject(document, key, value) {
  const keys = Object.keys(value);
  const unprefixedKeys = keys.filter(op => op[0] !== '$');
  if (unprefixedKeys.length > 0 || !keys.length) {
    // Literal (possibly empty) object ( or empty object )
    // Don't allow mixing '$'-prefixed with non-'$'-prefixed fields
    if (keys.length !== unprefixedKeys.length) {
      throw new Error("unknown operator: ".concat(unprefixedKeys[0]));
    }
    validateObject(value, key);
    insertIntoDocument(document, key, value);
  } else {
    Object.keys(value).forEach(op => {
      const object = value[op];
      if (op === '$eq') {
        populateDocumentWithKeyValue(document, key, object);
      } else if (op === '$all') {
        // every value for $all should be dealt with as separate $eq-s
        object.forEach(element => populateDocumentWithKeyValue(document, key, element));
      }
    });
  }
}

// Fills a document with certain fields from an upsert selector
function populateDocumentWithQueryFields(query) {
  let document = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  if (Object.getPrototypeOf(query) === Object.prototype) {
    // handle implicit $and
    Object.keys(query).forEach(key => {
      const value = query[key];
      if (key === '$and') {
        // handle explicit $and
        value.forEach(element => populateDocumentWithQueryFields(element, document));
      } else if (key === '$or') {
        // handle $or nodes with exactly 1 child
        if (value.length === 1) {
          populateDocumentWithQueryFields(value[0], document);
        }
      } else if (key[0] !== '$') {
        // Ignore other '$'-prefixed logical selectors
        populateDocumentWithKeyValue(document, key, value);
      }
    });
  } else {
    // Handle meteor-specific shortcut for selecting _id
    if (LocalCollection._selectorIsId(query)) {
      insertIntoDocument(document, '_id', query);
    }
  }
  return document;
}
function projectionDetails(fields) {
  // Find the non-_id keys (_id is handled specially because it is included
  // unless explicitly excluded). Sort the keys, so that our code to detect
  // overlaps like 'foo' and 'foo.bar' can assume that 'foo' comes first.
  let fieldsKeys = Object.keys(fields).sort();

  // If _id is the only field in the projection, do not remove it, since it is
  // required to determine if this is an exclusion or exclusion. Also keep an
  // inclusive _id, since inclusive _id follows the normal rules about mixing
  // inclusive and exclusive fields. If _id is not the only field in the
  // projection and is exclusive, remove it so it can be handled later by a
  // special case, since exclusive _id is always allowed.
  if (!(fieldsKeys.length === 1 && fieldsKeys[0] === '_id') && !(fieldsKeys.includes('_id') && fields._id)) {
    fieldsKeys = fieldsKeys.filter(key => key !== '_id');
  }
  let including = null; // Unknown

  fieldsKeys.forEach(keyPath => {
    const rule = !!fields[keyPath];
    if (including === null) {
      including = rule;
    }

    // This error message is copied from MongoDB shell
    if (including !== rule) {
      throw MinimongoError('You cannot currently mix including and excluding fields.');
    }
  });
  const projectionRulesTree = pathsToTree(fieldsKeys, path => including, (node, path, fullPath) => {
    // Check passed projection fields' keys: If you have two rules such as
    // 'foo.bar' and 'foo.bar.baz', then the result becomes ambiguous. If
    // that happens, there is a probability you are doing something wrong,
    // framework should notify you about such mistake earlier on cursor
    // compilation step than later during runtime.  Note, that real mongo
    // doesn't do anything about it and the later rule appears in projection
    // project, more priority it takes.
    //
    // Example, assume following in mongo shell:
    // > db.coll.insert({ a: { b: 23, c: 44 } })
    // > db.coll.find({}, { 'a': 1, 'a.b': 1 })
    // {"_id": ObjectId("520bfe456024608e8ef24af3"), "a": {"b": 23}}
    // > db.coll.find({}, { 'a.b': 1, 'a': 1 })
    // {"_id": ObjectId("520bfe456024608e8ef24af3"), "a": {"b": 23, "c": 44}}
    //
    // Note, how second time the return set of keys is different.
    const currentPath = fullPath;
    const anotherPath = path;
    throw MinimongoError("both ".concat(currentPath, " and ").concat(anotherPath, " found in fields option, ") + 'using both of them may trigger unexpected behavior. Did you mean to ' + 'use only one of them?');
  });
  return {
    including,
    tree: projectionRulesTree
  };
}
function regexpElementMatcher(regexp) {
  return value => {
    if (value instanceof RegExp) {
      return value.toString() === regexp.toString();
    }

    // Regexps only work against strings.
    if (typeof value !== 'string') {
      return false;
    }

    // Reset regexp's state to avoid inconsistent matching for objects with the
    // same value on consecutive calls of regexp.test. This happens only if the
    // regexp has the 'g' flag. Also note that ES6 introduces a new flag 'y' for
    // which we should *not* change the lastIndex but MongoDB doesn't support
    // either of these flags.
    regexp.lastIndex = 0;
    return regexp.test(value);
  };
}
// Validates the key in a path.
// Objects that are nested more then 1 level cannot have dotted fields
// or fields starting with '$'
function validateKeyInPath(key, path) {
  if (key.includes('.')) {
    throw new Error("The dotted field '".concat(key, "' in '").concat(path, ".").concat(key, " is not valid for storage."));
  }
  if (key[0] === '$') {
    throw new Error("The dollar ($) prefixed field  '".concat(path, ".").concat(key, " is not valid for storage."));
  }
}

// Recursively validates an object that is nested more than one level deep
function validateObject(object, path) {
  if (object && Object.getPrototypeOf(object) === Object.prototype) {
    Object.keys(object).forEach(key => {
      validateKeyInPath(key, path);
      validateObject(object[key], path + '.' + key);
    });
  }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"constants.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/minimongo/constants.js                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  getAsyncMethodName: () => getAsyncMethodName,
  ASYNC_COLLECTION_METHODS: () => ASYNC_COLLECTION_METHODS,
  ASYNC_CURSOR_METHODS: () => ASYNC_CURSOR_METHODS
});
function getAsyncMethodName(method) {
  return "".concat(method.replace('_', ''), "Async");
}
const ASYNC_COLLECTION_METHODS = ['_createCappedCollection', '_dropCollection', '_dropIndex', 'createIndex', 'findOne', 'insert', 'remove', 'update', 'upsert'];
const ASYNC_CURSOR_METHODS = ['count', 'fetch', 'forEach', 'map'];
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"cursor.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/minimongo/cursor.js                                                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  default: () => Cursor
});
let LocalCollection;
module.link("./local_collection.js", {
  default(v) {
    LocalCollection = v;
  }
}, 0);
let hasOwn;
module.link("./common.js", {
  hasOwn(v) {
    hasOwn = v;
  }
}, 1);
let ASYNC_CURSOR_METHODS, getAsyncMethodName;
module.link("./constants", {
  ASYNC_CURSOR_METHODS(v) {
    ASYNC_CURSOR_METHODS = v;
  },
  getAsyncMethodName(v) {
    getAsyncMethodName = v;
  }
}, 2);
class Cursor {
  // don't call this ctor directly.  use LocalCollection.find().
  constructor(collection, selector) {
    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    this.collection = collection;
    this.sorter = null;
    this.matcher = new Minimongo.Matcher(selector);
    if (LocalCollection._selectorIsIdPerhapsAsObject(selector)) {
      // stash for fast _id and { _id }
      this._selectorId = hasOwn.call(selector, '_id') ? selector._id : selector;
    } else {
      this._selectorId = undefined;
      if (this.matcher.hasGeoQuery() || options.sort) {
        this.sorter = new Minimongo.Sorter(options.sort || []);
      }
    }
    this.skip = options.skip || 0;
    this.limit = options.limit;
    this.fields = options.projection || options.fields;
    this._projectionFn = LocalCollection._compileProjection(this.fields || {});
    this._transform = LocalCollection.wrapTransform(options.transform);

    // by default, queries register w/ Tracker when it is available.
    if (typeof Tracker !== 'undefined') {
      this.reactive = options.reactive === undefined ? true : options.reactive;
    }
  }

  /**
   * @deprecated in 2.9
   * @summary Returns the number of documents that match a query. This method is
   *          [deprecated since MongoDB 4.0](https://www.mongodb.com/docs/v4.4/reference/command/count/);
   *          see `Collection.countDocuments` and
   *          `Collection.estimatedDocumentCount` for a replacement.
   * @memberOf Mongo.Cursor
   * @method  count
   * @instance
   * @locus Anywhere
   * @returns {Number}
   */
  count() {
    if (this.reactive) {
      // allow the observe to be unordered
      this._depend({
        added: true,
        removed: true
      }, true);
    }
    return this._getRawObjects({
      ordered: true
    }).length;
  }

  /**
   * @summary Return all matching documents as an Array.
   * @memberOf Mongo.Cursor
   * @method  fetch
   * @instance
   * @locus Anywhere
   * @returns {Object[]}
   */
  fetch() {
    const result = [];
    this.forEach(doc => {
      result.push(doc);
    });
    return result;
  }
  [Symbol.iterator]() {
    if (this.reactive) {
      this._depend({
        addedBefore: true,
        removed: true,
        changed: true,
        movedBefore: true
      });
    }
    let index = 0;
    const objects = this._getRawObjects({
      ordered: true
    });
    return {
      next: () => {
        if (index < objects.length) {
          // This doubles as a clone operation.
          let element = this._projectionFn(objects[index++]);
          if (this._transform) element = this._transform(element);
          return {
            value: element
          };
        }
        return {
          done: true
        };
      }
    };
  }
  [Symbol.asyncIterator]() {
    const syncResult = this[Symbol.iterator]();
    return {
      next() {
        return Promise.asyncApply(() => {
          return Promise.resolve(syncResult.next());
        });
      }
    };
  }

  /**
   * @callback IterationCallback
   * @param {Object} doc
   * @param {Number} index
   */
  /**
   * @summary Call `callback` once for each matching document, sequentially and
   *          synchronously.
   * @locus Anywhere
   * @method  forEach
   * @instance
   * @memberOf Mongo.Cursor
   * @param {IterationCallback} callback Function to call. It will be called
   *                                     with three arguments: the document, a
   *                                     0-based index, and <em>cursor</em>
   *                                     itself.
   * @param {Any} [thisArg] An object which will be the value of `this` inside
   *                        `callback`.
   */
  forEach(callback, thisArg) {
    if (this.reactive) {
      this._depend({
        addedBefore: true,
        removed: true,
        changed: true,
        movedBefore: true
      });
    }
    this._getRawObjects({
      ordered: true
    }).forEach((element, i) => {
      // This doubles as a clone operation.
      element = this._projectionFn(element);
      if (this._transform) {
        element = this._transform(element);
      }
      callback.call(thisArg, element, i, this);
    });
  }
  getTransform() {
    return this._transform;
  }

  /**
   * @summary Map callback over all matching documents.  Returns an Array.
   * @locus Anywhere
   * @method map
   * @instance
   * @memberOf Mongo.Cursor
   * @param {IterationCallback} callback Function to call. It will be called
   *                                     with three arguments: the document, a
   *                                     0-based index, and <em>cursor</em>
   *                                     itself.
   * @param {Any} [thisArg] An object which will be the value of `this` inside
   *                        `callback`.
   */
  map(callback, thisArg) {
    const result = [];
    this.forEach((doc, i) => {
      result.push(callback.call(thisArg, doc, i, this));
    });
    return result;
  }

  // options to contain:
  //  * callbacks for observe():
  //    - addedAt (document, atIndex)
  //    - added (document)
  //    - changedAt (newDocument, oldDocument, atIndex)
  //    - changed (newDocument, oldDocument)
  //    - removedAt (document, atIndex)
  //    - removed (document)
  //    - movedTo (document, oldIndex, newIndex)
  //
  // attributes available on returned query handle:
  //  * stop(): end updates
  //  * collection: the collection this query is querying
  //
  // iff x is a returned query handle, (x instanceof
  // LocalCollection.ObserveHandle) is true
  //
  // initial results delivered through added callback
  // XXX maybe callbacks should take a list of objects, to expose transactions?
  // XXX maybe support field limiting (to limit what you're notified on)

  /**
   * @summary Watch a query.  Receive callbacks as the result set changes.
   * @locus Anywhere
   * @memberOf Mongo.Cursor
   * @instance
   * @param {Object} callbacks Functions to call to deliver the result set as it
   *                           changes
   */
  observe(options) {
    return LocalCollection._observeFromObserveChanges(this, options);
  }

  /**
   * @summary Watch a query. Receive callbacks as the result set changes. Only
   *          the differences between the old and new documents are passed to
   *          the callbacks.
   * @locus Anywhere
   * @memberOf Mongo.Cursor
   * @instance
   * @param {Object} callbacks Functions to call to deliver the result set as it
   *                           changes
   */
  observeChanges(options) {
    const ordered = LocalCollection._observeChangesCallbacksAreOrdered(options);

    // there are several places that assume you aren't combining skip/limit with
    // unordered observe.  eg, update's EJSON.clone, and the "there are several"
    // comment in _modifyAndNotify
    // XXX allow skip/limit with unordered observe
    if (!options._allow_unordered && !ordered && (this.skip || this.limit)) {
      throw new Error("Must use an ordered observe with skip or limit (i.e. 'addedBefore' " + "for observeChanges or 'addedAt' for observe, instead of 'added').");
    }
    if (this.fields && (this.fields._id === 0 || this.fields._id === false)) {
      throw Error('You may not observe a cursor with {fields: {_id: 0}}');
    }
    const distances = this.matcher.hasGeoQuery() && ordered && new LocalCollection._IdMap();
    const query = {
      cursor: this,
      dirty: false,
      distances,
      matcher: this.matcher,
      // not fast pathed
      ordered,
      projectionFn: this._projectionFn,
      resultsSnapshot: null,
      sorter: ordered && this.sorter
    };
    let qid;

    // Non-reactive queries call added[Before] and then never call anything
    // else.
    if (this.reactive) {
      qid = this.collection.next_qid++;
      this.collection.queries[qid] = query;
    }
    query.results = this._getRawObjects({
      ordered,
      distances: query.distances
    });
    if (this.collection.paused) {
      query.resultsSnapshot = ordered ? [] : new LocalCollection._IdMap();
    }

    // wrap callbacks we were passed. callbacks only fire when not paused and
    // are never undefined
    // Filters out blacklisted fields according to cursor's projection.
    // XXX wrong place for this?

    // furthermore, callbacks enqueue until the operation we're working on is
    // done.
    const wrapCallback = fn => {
      if (!fn) {
        return () => {};
      }
      const self = this;
      return function /* args*/
      () {
        if (self.collection.paused) {
          return;
        }
        const args = arguments;
        self.collection._observeQueue.queueTask(() => {
          fn.apply(this, args);
        });
      };
    };
    query.added = wrapCallback(options.added);
    query.changed = wrapCallback(options.changed);
    query.removed = wrapCallback(options.removed);
    if (ordered) {
      query.addedBefore = wrapCallback(options.addedBefore);
      query.movedBefore = wrapCallback(options.movedBefore);
    }
    if (!options._suppress_initial && !this.collection.paused) {
      query.results.forEach(doc => {
        const fields = EJSON.clone(doc);
        delete fields._id;
        if (ordered) {
          query.addedBefore(doc._id, this._projectionFn(fields), null);
        }
        query.added(doc._id, this._projectionFn(fields));
      });
    }
    const handle = Object.assign(new LocalCollection.ObserveHandle(), {
      collection: this.collection,
      stop: () => {
        if (this.reactive) {
          delete this.collection.queries[qid];
        }
      }
    });
    if (this.reactive && Tracker.active) {
      // XXX in many cases, the same observe will be recreated when
      // the current autorun is rerun.  we could save work by
      // letting it linger across rerun and potentially get
      // repurposed if the same observe is performed, using logic
      // similar to that of Meteor.subscribe.
      Tracker.onInvalidate(() => {
        handle.stop();
      });
    }

    // run the observe callbacks resulting from the initial contents
    // before we leave the observe.
    this.collection._observeQueue.drain();
    return handle;
  }

  // XXX Maybe we need a version of observe that just calls a callback if
  // anything changed.
  _depend(changers, _allow_unordered) {
    if (Tracker.active) {
      const dependency = new Tracker.Dependency();
      const notify = dependency.changed.bind(dependency);
      dependency.depend();
      const options = {
        _allow_unordered,
        _suppress_initial: true
      };
      ['added', 'addedBefore', 'changed', 'movedBefore', 'removed'].forEach(fn => {
        if (changers[fn]) {
          options[fn] = notify;
        }
      });

      // observeChanges will stop() when this computation is invalidated
      this.observeChanges(options);
    }
  }
  _getCollectionName() {
    return this.collection.name;
  }

  // Returns a collection of matching objects, but doesn't deep copy them.
  //
  // If ordered is set, returns a sorted array, respecting sorter, skip, and
  // limit properties of the query provided that options.applySkipLimit is
  // not set to false (#1201). If sorter is falsey, no sort -- you get the
  // natural order.
  //
  // If ordered is not set, returns an object mapping from ID to doc (sorter,
  // skip and limit should not be set).
  //
  // If ordered is set and this cursor is a $near geoquery, then this function
  // will use an _IdMap to track each distance from the $near argument point in
  // order to use it as a sort key. If an _IdMap is passed in the 'distances'
  // argument, this function will clear it and use it for this purpose
  // (otherwise it will just create its own _IdMap). The observeChanges
  // implementation uses this to remember the distances after this function
  // returns.
  _getRawObjects() {
    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    // By default this method will respect skip and limit because .fetch(),
    // .forEach() etc... expect this behaviour. It can be forced to ignore
    // skip and limit by setting applySkipLimit to false (.count() does this,
    // for example)
    const applySkipLimit = options.applySkipLimit !== false;

    // XXX use OrderedDict instead of array, and make IdMap and OrderedDict
    // compatible
    const results = options.ordered ? [] : new LocalCollection._IdMap();

    // fast path for single ID value
    if (this._selectorId !== undefined) {
      // If you have non-zero skip and ask for a single id, you get nothing.
      // This is so it matches the behavior of the '{_id: foo}' path.
      if (applySkipLimit && this.skip) {
        return results;
      }
      const selectedDoc = this.collection._docs.get(this._selectorId);
      if (selectedDoc) {
        if (options.ordered) {
          results.push(selectedDoc);
        } else {
          results.set(this._selectorId, selectedDoc);
        }
      }
      return results;
    }

    // slow path for arbitrary selector, sort, skip, limit

    // in the observeChanges case, distances is actually part of the "query"
    // (ie, live results set) object.  in other cases, distances is only used
    // inside this function.
    let distances;
    if (this.matcher.hasGeoQuery() && options.ordered) {
      if (options.distances) {
        distances = options.distances;
        distances.clear();
      } else {
        distances = new LocalCollection._IdMap();
      }
    }
    this.collection._docs.forEach((doc, id) => {
      const matchResult = this.matcher.documentMatches(doc);
      if (matchResult.result) {
        if (options.ordered) {
          results.push(doc);
          if (distances && matchResult.distance !== undefined) {
            distances.set(id, matchResult.distance);
          }
        } else {
          results.set(id, doc);
        }
      }

      // Override to ensure all docs are matched if ignoring skip & limit
      if (!applySkipLimit) {
        return true;
      }

      // Fast path for limited unsorted queries.
      // XXX 'length' check here seems wrong for ordered
      return !this.limit || this.skip || this.sorter || results.length !== this.limit;
    });
    if (!options.ordered) {
      return results;
    }
    if (this.sorter) {
      results.sort(this.sorter.getComparator({
        distances
      }));
    }

    // Return the full set of results if there is no skip or limit or if we're
    // ignoring them
    if (!applySkipLimit || !this.limit && !this.skip) {
      return results;
    }
    return results.slice(this.skip, this.limit ? this.limit + this.skip : results.length);
  }
  _publishCursor(subscription) {
    // XXX minimongo should not depend on mongo-livedata!
    if (!Package.mongo) {
      throw new Error('Can\'t publish from Minimongo without the `mongo` package.');
    }
    if (!this.collection.name) {
      throw new Error('Can\'t publish a cursor from a collection without a name.');
    }
    return Package.mongo.Mongo.Collection._publishCursor(this, subscription, this.collection.name);
  }
}
// Implements async version of cursor methods to keep collections isomorphic
ASYNC_CURSOR_METHODS.forEach(method => {
  const asyncName = getAsyncMethodName(method);
  Cursor.prototype[asyncName] = function () {
    try {
      this[method].isCalledFromAsync = true;
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      return Promise.resolve(this[method].apply(this, args));
    } catch (error) {
      return Promise.reject(error);
    }
  };
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"local_collection.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/minimongo/local_collection.js                                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
module.export({
  default: () => LocalCollection
});
let Cursor;
module.link("./cursor.js", {
  default(v) {
    Cursor = v;
  }
}, 0);
let ObserveHandle;
module.link("./observe_handle.js", {
  default(v) {
    ObserveHandle = v;
  }
}, 1);
let hasOwn, isIndexable, isNumericKey, isOperatorObject, populateDocumentWithQueryFields, projectionDetails;
module.link("./common.js", {
  hasOwn(v) {
    hasOwn = v;
  },
  isIndexable(v) {
    isIndexable = v;
  },
  isNumericKey(v) {
    isNumericKey = v;
  },
  isOperatorObject(v) {
    isOperatorObject = v;
  },
  populateDocumentWithQueryFields(v) {
    populateDocumentWithQueryFields = v;
  },
  projectionDetails(v) {
    projectionDetails = v;
  }
}, 2);
class LocalCollection {
  constructor(name) {
    this.name = name;
    // _id -> document (also containing id)
    this._docs = new LocalCollection._IdMap();
    this._observeQueue = new Meteor._SynchronousQueue();
    this.next_qid = 1; // live query id generator

    // qid -> live query object. keys:
    //  ordered: bool. ordered queries have addedBefore/movedBefore callbacks.
    //  results: array (ordered) or object (unordered) of current results
    //    (aliased with this._docs!)
    //  resultsSnapshot: snapshot of results. null if not paused.
    //  cursor: Cursor object for the query.
    //  selector, sorter, (callbacks): functions
    this.queries = Object.create(null);

    // null if not saving originals; an IdMap from id to original document value
    // if saving originals. See comments before saveOriginals().
    this._savedOriginals = null;

    // True when observers are paused and we should not send callbacks.
    this.paused = false;
  }
  countDocuments(selector, options) {
    return this.find(selector !== null && selector !== void 0 ? selector : {}, options).countAsync();
  }
  estimatedDocumentCount(options) {
    return this.find({}, options).countAsync();
  }

  // options may include sort, skip, limit, reactive
  // sort may be any of these forms:
  //     {a: 1, b: -1}
  //     [["a", "asc"], ["b", "desc"]]
  //     ["a", ["b", "desc"]]
  //   (in the first form you're beholden to key enumeration order in
  //   your javascript VM)
  //
  // reactive: if given, and false, don't register with Tracker (default
  // is true)
  //
  // XXX possibly should support retrieving a subset of fields? and
  // have it be a hint (ignored on the client, when not copying the
  // doc?)
  //
  // XXX sort does not yet support subkeys ('a.b') .. fix that!
  // XXX add one more sort form: "key"
  // XXX tests
  find(selector, options) {
    // default syntax for everything is to omit the selector argument.
    // but if selector is explicitly passed in as false or undefined, we
    // want a selector that matches nothing.
    if (arguments.length === 0) {
      selector = {};
    }
    return new LocalCollection.Cursor(this, selector, options);
  }
  findOne(selector) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    if (arguments.length === 0) {
      selector = {};
    }

    // NOTE: by setting limit 1 here, we end up using very inefficient
    // code that recomputes the whole query on each update. The upside is
    // that when you reactively depend on a findOne you only get
    // invalidated when the found object changes, not any object in the
    // collection. Most findOne will be by id, which has a fast path, so
    // this might not be a big deal. In most cases, invalidation causes
    // the called to re-query anyway, so this should be a net performance
    // improvement.
    options.limit = 1;
    return this.find(selector, options).fetch()[0];
  }

  // XXX possibly enforce that 'undefined' does not appear (we assume
  // this in our handling of null and $exists)
  insert(doc, callback) {
    doc = EJSON.clone(doc);
    assertHasValidFieldNames(doc);

    // if you really want to use ObjectIDs, set this global.
    // Mongo.Collection specifies its own ids and does not use this code.
    if (!hasOwn.call(doc, '_id')) {
      doc._id = LocalCollection._useOID ? new MongoID.ObjectID() : Random.id();
    }
    const id = doc._id;
    if (this._docs.has(id)) {
      throw MinimongoError("Duplicate _id '".concat(id, "'"));
    }
    this._saveOriginal(id, undefined);
    this._docs.set(id, doc);
    const queriesToRecompute = [];

    // trigger live queries that match
    Object.keys(this.queries).forEach(qid => {
      const query = this.queries[qid];
      if (query.dirty) {
        return;
      }
      const matchResult = query.matcher.documentMatches(doc);
      if (matchResult.result) {
        if (query.distances && matchResult.distance !== undefined) {
          query.distances.set(id, matchResult.distance);
        }
        if (query.cursor.skip || query.cursor.limit) {
          queriesToRecompute.push(qid);
        } else {
          LocalCollection._insertInResults(query, doc);
        }
      }
    });
    queriesToRecompute.forEach(qid => {
      if (this.queries[qid]) {
        this._recomputeResults(this.queries[qid]);
      }
    });
    this._observeQueue.drain();

    // Defer because the caller likely doesn't expect the callback to be run
    // immediately.
    if (callback) {
      Meteor.defer(() => {
        callback(null, id);
      });
    }
    return id;
  }

  // Pause the observers. No callbacks from observers will fire until
  // 'resumeObservers' is called.
  pauseObservers() {
    // No-op if already paused.
    if (this.paused) {
      return;
    }

    // Set the 'paused' flag such that new observer messages don't fire.
    this.paused = true;

    // Take a snapshot of the query results for each query.
    Object.keys(this.queries).forEach(qid => {
      const query = this.queries[qid];
      query.resultsSnapshot = EJSON.clone(query.results);
    });
  }
  remove(selector, callback) {
    // Easy special case: if we're not calling observeChanges callbacks and
    // we're not saving originals and we got asked to remove everything, then
    // just empty everything directly.
    if (this.paused && !this._savedOriginals && EJSON.equals(selector, {})) {
      const result = this._docs.size();
      this._docs.clear();
      Object.keys(this.queries).forEach(qid => {
        const query = this.queries[qid];
        if (query.ordered) {
          query.results = [];
        } else {
          query.results.clear();
        }
      });
      if (callback) {
        Meteor.defer(() => {
          callback(null, result);
        });
      }
      return result;
    }
    const matcher = new Minimongo.Matcher(selector);
    const remove = [];
    this._eachPossiblyMatchingDoc(selector, (doc, id) => {
      if (matcher.documentMatches(doc).result) {
        remove.push(id);
      }
    });
    const queriesToRecompute = [];
    const queryRemove = [];
    for (let i = 0; i < remove.length; i++) {
      const removeId = remove[i];
      const removeDoc = this._docs.get(removeId);
      Object.keys(this.queries).forEach(qid => {
        const query = this.queries[qid];
        if (query.dirty) {
          return;
        }
        if (query.matcher.documentMatches(removeDoc).result) {
          if (query.cursor.skip || query.cursor.limit) {
            queriesToRecompute.push(qid);
          } else {
            queryRemove.push({
              qid,
              doc: removeDoc
            });
          }
        }
      });
      this._saveOriginal(removeId, removeDoc);
      this._docs.remove(removeId);
    }

    // run live query callbacks _after_ we've removed the documents.
    queryRemove.forEach(remove => {
      const query = this.queries[remove.qid];
      if (query) {
        query.distances && query.distances.remove(remove.doc._id);
        LocalCollection._removeFromResults(query, remove.doc);
      }
    });
    queriesToRecompute.forEach(qid => {
      const query = this.queries[qid];
      if (query) {
        this._recomputeResults(query);
      }
    });
    this._observeQueue.drain();
    const result = remove.length;
    if (callback) {
      Meteor.defer(() => {
        callback(null, result);
      });
    }
    return result;
  }

  // Resume the observers. Observers immediately receive change
  // notifications to bring them to the current state of the
  // database. Note that this is not just replaying all the changes that
  // happened during the pause, it is a smarter 'coalesced' diff.
  resumeObservers() {
    // No-op if not paused.
    if (!this.paused) {
      return;
    }

    // Unset the 'paused' flag. Make sure to do this first, otherwise
    // observer methods won't actually fire when we trigger them.
    this.paused = false;
    Object.keys(this.queries).forEach(qid => {
      const query = this.queries[qid];
      if (query.dirty) {
        query.dirty = false;

        // re-compute results will perform `LocalCollection._diffQueryChanges`
        // automatically.
        this._recomputeResults(query, query.resultsSnapshot);
      } else {
        // Diff the current results against the snapshot and send to observers.
        // pass the query object for its observer callbacks.
        LocalCollection._diffQueryChanges(query.ordered, query.resultsSnapshot, query.results, query, {
          projectionFn: query.projectionFn
        });
      }
      query.resultsSnapshot = null;
    });
    this._observeQueue.drain();
  }
  retrieveOriginals() {
    if (!this._savedOriginals) {
      throw new Error('Called retrieveOriginals without saveOriginals');
    }
    const originals = this._savedOriginals;
    this._savedOriginals = null;
    return originals;
  }

  // To track what documents are affected by a piece of code, call
  // saveOriginals() before it and retrieveOriginals() after it.
  // retrieveOriginals returns an object whose keys are the ids of the documents
  // that were affected since the call to saveOriginals(), and the values are
  // equal to the document's contents at the time of saveOriginals. (In the case
  // of an inserted document, undefined is the value.) You must alternate
  // between calls to saveOriginals() and retrieveOriginals().
  saveOriginals() {
    if (this._savedOriginals) {
      throw new Error('Called saveOriginals twice without retrieveOriginals');
    }
    this._savedOriginals = new LocalCollection._IdMap();
  }

  // XXX atomicity: if multi is true, and one modification fails, do
  // we rollback the whole operation, or what?
  update(selector, mod, options, callback) {
    if (!callback && options instanceof Function) {
      callback = options;
      options = null;
    }
    if (!options) {
      options = {};
    }
    const matcher = new Minimongo.Matcher(selector, true);

    // Save the original results of any query that we might need to
    // _recomputeResults on, because _modifyAndNotify will mutate the objects in
    // it. (We don't need to save the original results of paused queries because
    // they already have a resultsSnapshot and we won't be diffing in
    // _recomputeResults.)
    const qidToOriginalResults = {};

    // We should only clone each document once, even if it appears in multiple
    // queries
    const docMap = new LocalCollection._IdMap();
    const idsMatched = LocalCollection._idsMatchedBySelector(selector);
    Object.keys(this.queries).forEach(qid => {
      const query = this.queries[qid];
      if ((query.cursor.skip || query.cursor.limit) && !this.paused) {
        // Catch the case of a reactive `count()` on a cursor with skip
        // or limit, which registers an unordered observe. This is a
        // pretty rare case, so we just clone the entire result set with
        // no optimizations for documents that appear in these result
        // sets and other queries.
        if (query.results instanceof LocalCollection._IdMap) {
          qidToOriginalResults[qid] = query.results.clone();
          return;
        }
        if (!(query.results instanceof Array)) {
          throw new Error('Assertion failed: query.results not an array');
        }

        // Clones a document to be stored in `qidToOriginalResults`
        // because it may be modified before the new and old result sets
        // are diffed. But if we know exactly which document IDs we're
        // going to modify, then we only need to clone those.
        const memoizedCloneIfNeeded = doc => {
          if (docMap.has(doc._id)) {
            return docMap.get(doc._id);
          }
          const docToMemoize = idsMatched && !idsMatched.some(id => EJSON.equals(id, doc._id)) ? doc : EJSON.clone(doc);
          docMap.set(doc._id, docToMemoize);
          return docToMemoize;
        };
        qidToOriginalResults[qid] = query.results.map(memoizedCloneIfNeeded);
      }
    });
    const recomputeQids = {};
    let updateCount = 0;
    this._eachPossiblyMatchingDoc(selector, (doc, id) => {
      const queryResult = matcher.documentMatches(doc);
      if (queryResult.result) {
        // XXX Should we save the original even if mod ends up being a no-op?
        this._saveOriginal(id, doc);
        this._modifyAndNotify(doc, mod, recomputeQids, queryResult.arrayIndices);
        ++updateCount;
        if (!options.multi) {
          return false; // break
        }
      }

      return true;
    });
    Object.keys(recomputeQids).forEach(qid => {
      const query = this.queries[qid];
      if (query) {
        this._recomputeResults(query, qidToOriginalResults[qid]);
      }
    });
    this._observeQueue.drain();

    // If we are doing an upsert, and we didn't modify any documents yet, then
    // it's time to do an insert. Figure out what document we are inserting, and
    // generate an id for it.
    let insertedId;
    if (updateCount === 0 && options.upsert) {
      const doc = LocalCollection._createUpsertDocument(selector, mod);
      if (!doc._id && options.insertedId) {
        doc._id = options.insertedId;
      }
      insertedId = this.insert(doc);
      updateCount = 1;
    }

    // Return the number of affected documents, or in the upsert case, an object
    // containing the number of affected docs and the id of the doc that was
    // inserted, if any.
    let result;
    if (options._returnObject) {
      result = {
        numberAffected: updateCount
      };
      if (insertedId !== undefined) {
        result.insertedId = insertedId;
      }
    } else {
      result = updateCount;
    }
    if (callback) {
      Meteor.defer(() => {
        callback(null, result);
      });
    }
    return result;
  }

  // A convenience wrapper on update. LocalCollection.upsert(sel, mod) is
  // equivalent to LocalCollection.update(sel, mod, {upsert: true,
  // _returnObject: true}).
  upsert(selector, mod, options, callback) {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }
    return this.update(selector, mod, Object.assign({}, options, {
      upsert: true,
      _returnObject: true
    }), callback);
  }

  // Iterates over a subset of documents that could match selector; calls
  // fn(doc, id) on each of them.  Specifically, if selector specifies
  // specific _id's, it only looks at those.  doc is *not* cloned: it is the
  // same object that is in _docs.
  _eachPossiblyMatchingDoc(selector, fn) {
    const specificIds = LocalCollection._idsMatchedBySelector(selector);
    if (specificIds) {
      specificIds.some(id => {
        const doc = this._docs.get(id);
        if (doc) {
          return fn(doc, id) === false;
        }
      });
    } else {
      this._docs.forEach(fn);
    }
  }
  _modifyAndNotify(doc, mod, recomputeQids, arrayIndices) {
    const matched_before = {};
    Object.keys(this.queries).forEach(qid => {
      const query = this.queries[qid];
      if (query.dirty) {
        return;
      }
      if (query.ordered) {
        matched_before[qid] = query.matcher.documentMatches(doc).result;
      } else {
        // Because we don't support skip or limit (yet) in unordered queries, we
        // can just do a direct lookup.
        matched_before[qid] = query.results.has(doc._id);
      }
    });
    const old_doc = EJSON.clone(doc);
    LocalCollection._modify(doc, mod, {
      arrayIndices
    });
    Object.keys(this.queries).forEach(qid => {
      const query = this.queries[qid];
      if (query.dirty) {
        return;
      }
      const afterMatch = query.matcher.documentMatches(doc);
      const after = afterMatch.result;
      const before = matched_before[qid];
      if (after && query.distances && afterMatch.distance !== undefined) {
        query.distances.set(doc._id, afterMatch.distance);
      }
      if (query.cursor.skip || query.cursor.limit) {
        // We need to recompute any query where the doc may have been in the
        // cursor's window either before or after the update. (Note that if skip
        // or limit is set, "before" and "after" being true do not necessarily
        // mean that the document is in the cursor's output after skip/limit is
        // applied... but if they are false, then the document definitely is NOT
        // in the output. So it's safe to skip recompute if neither before or
        // after are true.)
        if (before || after) {
          recomputeQids[qid] = true;
        }
      } else if (before && !after) {
        LocalCollection._removeFromResults(query, doc);
      } else if (!before && after) {
        LocalCollection._insertInResults(query, doc);
      } else if (before && after) {
        LocalCollection._updateInResults(query, doc, old_doc);
      }
    });
  }

  // Recomputes the results of a query and runs observe callbacks for the
  // difference between the previous results and the current results (unless
  // paused). Used for skip/limit queries.
  //
  // When this is used by insert or remove, it can just use query.results for
  // the old results (and there's no need to pass in oldResults), because these
  // operations don't mutate the documents in the collection. Update needs to
  // pass in an oldResults which was deep-copied before the modifier was
  // applied.
  //
  // oldResults is guaranteed to be ignored if the query is not paused.
  _recomputeResults(query, oldResults) {
    if (this.paused) {
      // There's no reason to recompute the results now as we're still paused.
      // By flagging the query as "dirty", the recompute will be performed
      // when resumeObservers is called.
      query.dirty = true;
      return;
    }
    if (!this.paused && !oldResults) {
      oldResults = query.results;
    }
    if (query.distances) {
      query.distances.clear();
    }
    query.results = query.cursor._getRawObjects({
      distances: query.distances,
      ordered: query.ordered
    });
    if (!this.paused) {
      LocalCollection._diffQueryChanges(query.ordered, oldResults, query.results, query, {
        projectionFn: query.projectionFn
      });
    }
  }
  _saveOriginal(id, doc) {
    // Are we even trying to save originals?
    if (!this._savedOriginals) {
      return;
    }

    // Have we previously mutated the original (and so 'doc' is not actually
    // original)?  (Note the 'has' check rather than truth: we store undefined
    // here for inserted docs!)
    if (this._savedOriginals.has(id)) {
      return;
    }
    this._savedOriginals.set(id, EJSON.clone(doc));
  }
}
LocalCollection.Cursor = Cursor;
LocalCollection.ObserveHandle = ObserveHandle;

// XXX maybe move these into another ObserveHelpers package or something

// _CachingChangeObserver is an object which receives observeChanges callbacks
// and keeps a cache of the current cursor state up to date in this.docs. Users
// of this class should read the docs field but not modify it. You should pass
// the "applyChange" field as the callbacks to the underlying observeChanges
// call. Optionally, you can specify your own observeChanges callbacks which are
// invoked immediately before the docs field is updated; this object is made
// available as `this` to those callbacks.
LocalCollection._CachingChangeObserver = class _CachingChangeObserver {
  constructor() {
    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    const orderedFromCallbacks = options.callbacks && LocalCollection._observeChangesCallbacksAreOrdered(options.callbacks);
    if (hasOwn.call(options, 'ordered')) {
      this.ordered = options.ordered;
      if (options.callbacks && options.ordered !== orderedFromCallbacks) {
        throw Error('ordered option doesn\'t match callbacks');
      }
    } else if (options.callbacks) {
      this.ordered = orderedFromCallbacks;
    } else {
      throw Error('must provide ordered or callbacks');
    }
    const callbacks = options.callbacks || {};
    if (this.ordered) {
      this.docs = new OrderedDict(MongoID.idStringify);
      this.applyChange = {
        addedBefore: (id, fields, before) => {
          // Take a shallow copy since the top-level properties can be changed
          const doc = _objectSpread({}, fields);
          doc._id = id;
          if (callbacks.addedBefore) {
            callbacks.addedBefore.call(this, id, EJSON.clone(fields), before);
          }

          // This line triggers if we provide added with movedBefore.
          if (callbacks.added) {
            callbacks.added.call(this, id, EJSON.clone(fields));
          }

          // XXX could `before` be a falsy ID?  Technically
          // idStringify seems to allow for them -- though
          // OrderedDict won't call stringify on a falsy arg.
          this.docs.putBefore(id, doc, before || null);
        },
        movedBefore: (id, before) => {
          const doc = this.docs.get(id);
          if (callbacks.movedBefore) {
            callbacks.movedBefore.call(this, id, before);
          }
          this.docs.moveBefore(id, before || null);
        }
      };
    } else {
      this.docs = new LocalCollection._IdMap();
      this.applyChange = {
        added: (id, fields) => {
          // Take a shallow copy since the top-level properties can be changed
          const doc = _objectSpread({}, fields);
          if (callbacks.added) {
            callbacks.added.call(this, id, EJSON.clone(fields));
          }
          doc._id = id;
          this.docs.set(id, doc);
        }
      };
    }

    // The methods in _IdMap and OrderedDict used by these callbacks are
    // identical.
    this.applyChange.changed = (id, fields) => {
      const doc = this.docs.get(id);
      if (!doc) {
        throw new Error("Unknown id for changed: ".concat(id));
      }
      if (callbacks.changed) {
        callbacks.changed.call(this, id, EJSON.clone(fields));
      }
      DiffSequence.applyChanges(doc, fields);
    };
    this.applyChange.removed = id => {
      if (callbacks.removed) {
        callbacks.removed.call(this, id);
      }
      this.docs.remove(id);
    };
  }
};
LocalCollection._IdMap = class _IdMap extends IdMap {
  constructor() {
    super(MongoID.idStringify, MongoID.idParse);
  }
};

// Wrap a transform function to return objects that have the _id field
// of the untransformed document. This ensures that subsystems such as
// the observe-sequence package that call `observe` can keep track of
// the documents identities.
//
// - Require that it returns objects
// - If the return value has an _id field, verify that it matches the
//   original _id field
// - If the return value doesn't have an _id field, add it back.
LocalCollection.wrapTransform = transform => {
  if (!transform) {
    return null;
  }

  // No need to doubly-wrap transforms.
  if (transform.__wrappedTransform__) {
    return transform;
  }
  const wrapped = doc => {
    if (!hasOwn.call(doc, '_id')) {
      // XXX do we ever have a transform on the oplog's collection? because that
      // collection has no _id.
      throw new Error('can only transform documents with _id');
    }
    const id = doc._id;

    // XXX consider making tracker a weak dependency and checking
    // Package.tracker here
    const transformed = Tracker.nonreactive(() => transform(doc));
    if (!LocalCollection._isPlainObject(transformed)) {
      throw new Error('transform must return object');
    }
    if (hasOwn.call(transformed, '_id')) {
      if (!EJSON.equals(transformed._id, id)) {
        throw new Error('transformed document can\'t have different _id');
      }
    } else {
      transformed._id = id;
    }
    return transformed;
  };
  wrapped.__wrappedTransform__ = true;
  return wrapped;
};

// XXX the sorted-query logic below is laughably inefficient. we'll
// need to come up with a better datastructure for this.
//
// XXX the logic for observing with a skip or a limit is even more
// laughably inefficient. we recompute the whole results every time!

// This binary search puts a value between any equal values, and the first
// lesser value.
LocalCollection._binarySearch = (cmp, array, value) => {
  let first = 0;
  let range = array.length;
  while (range > 0) {
    const halfRange = Math.floor(range / 2);
    if (cmp(value, array[first + halfRange]) >= 0) {
      first += halfRange + 1;
      range -= halfRange + 1;
    } else {
      range = halfRange;
    }
  }
  return first;
};
LocalCollection._checkSupportedProjection = fields => {
  if (fields !== Object(fields) || Array.isArray(fields)) {
    throw MinimongoError('fields option must be an object');
  }
  Object.keys(fields).forEach(keyPath => {
    if (keyPath.split('.').includes('$')) {
      throw MinimongoError('Minimongo doesn\'t support $ operator in projections yet.');
    }
    const value = fields[keyPath];
    if (typeof value === 'object' && ['$elemMatch', '$meta', '$slice'].some(key => hasOwn.call(value, key))) {
      throw MinimongoError('Minimongo doesn\'t support operators in projections yet.');
    }
    if (![1, 0, true, false].includes(value)) {
      throw MinimongoError('Projection values should be one of 1, 0, true, or false');
    }
  });
};

// Knows how to compile a fields projection to a predicate function.
// @returns - Function: a closure that filters out an object according to the
//            fields projection rules:
//            @param obj - Object: MongoDB-styled document
//            @returns - Object: a document with the fields filtered out
//                       according to projection rules. Doesn't retain subfields
//                       of passed argument.
LocalCollection._compileProjection = fields => {
  LocalCollection._checkSupportedProjection(fields);
  const _idProjection = fields._id === undefined ? true : fields._id;
  const details = projectionDetails(fields);

  // returns transformed doc according to ruleTree
  const transform = (doc, ruleTree) => {
    // Special case for "sets"
    if (Array.isArray(doc)) {
      return doc.map(subdoc => transform(subdoc, ruleTree));
    }
    const result = details.including ? {} : EJSON.clone(doc);
    Object.keys(ruleTree).forEach(key => {
      if (doc == null || !hasOwn.call(doc, key)) {
        return;
      }
      const rule = ruleTree[key];
      if (rule === Object(rule)) {
        // For sub-objects/subsets we branch
        if (doc[key] === Object(doc[key])) {
          result[key] = transform(doc[key], rule);
        }
      } else if (details.including) {
        // Otherwise we don't even touch this subfield
        result[key] = EJSON.clone(doc[key]);
      } else {
        delete result[key];
      }
    });
    return doc != null ? result : doc;
  };
  return doc => {
    const result = transform(doc, details.tree);
    if (_idProjection && hasOwn.call(doc, '_id')) {
      result._id = doc._id;
    }
    if (!_idProjection && hasOwn.call(result, '_id')) {
      delete result._id;
    }
    return result;
  };
};

// Calculates the document to insert in case we're doing an upsert and the
// selector does not match any elements
LocalCollection._createUpsertDocument = (selector, modifier) => {
  const selectorDocument = populateDocumentWithQueryFields(selector);
  const isModify = LocalCollection._isModificationMod(modifier);
  const newDoc = {};
  if (selectorDocument._id) {
    newDoc._id = selectorDocument._id;
    delete selectorDocument._id;
  }

  // This double _modify call is made to help with nested properties (see issue
  // #8631). We do this even if it's a replacement for validation purposes (e.g.
  // ambiguous id's)
  LocalCollection._modify(newDoc, {
    $set: selectorDocument
  });
  LocalCollection._modify(newDoc, modifier, {
    isInsert: true
  });
  if (isModify) {
    return newDoc;
  }

  // Replacement can take _id from query document
  const replacement = Object.assign({}, modifier);
  if (newDoc._id) {
    replacement._id = newDoc._id;
  }
  return replacement;
};
LocalCollection._diffObjects = (left, right, callbacks) => {
  return DiffSequence.diffObjects(left, right, callbacks);
};

// ordered: bool.
// old_results and new_results: collections of documents.
//    if ordered, they are arrays.
//    if unordered, they are IdMaps
LocalCollection._diffQueryChanges = (ordered, oldResults, newResults, observer, options) => DiffSequence.diffQueryChanges(ordered, oldResults, newResults, observer, options);
LocalCollection._diffQueryOrderedChanges = (oldResults, newResults, observer, options) => DiffSequence.diffQueryOrderedChanges(oldResults, newResults, observer, options);
LocalCollection._diffQueryUnorderedChanges = (oldResults, newResults, observer, options) => DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, observer, options);
LocalCollection._findInOrderedResults = (query, doc) => {
  if (!query.ordered) {
    throw new Error('Can\'t call _findInOrderedResults on unordered query');
  }
  for (let i = 0; i < query.results.length; i++) {
    if (query.results[i] === doc) {
      return i;
    }
  }
  throw Error('object missing from query');
};

// If this is a selector which explicitly constrains the match by ID to a finite
// number of documents, returns a list of their IDs.  Otherwise returns
// null. Note that the selector may have other restrictions so it may not even
// match those document!  We care about $in and $and since those are generated
// access-controlled update and remove.
LocalCollection._idsMatchedBySelector = selector => {
  // Is the selector just an ID?
  if (LocalCollection._selectorIsId(selector)) {
    return [selector];
  }
  if (!selector) {
    return null;
  }

  // Do we have an _id clause?
  if (hasOwn.call(selector, '_id')) {
    // Is the _id clause just an ID?
    if (LocalCollection._selectorIsId(selector._id)) {
      return [selector._id];
    }

    // Is the _id clause {_id: {$in: ["x", "y", "z"]}}?
    if (selector._id && Array.isArray(selector._id.$in) && selector._id.$in.length && selector._id.$in.every(LocalCollection._selectorIsId)) {
      return selector._id.$in;
    }
    return null;
  }

  // If this is a top-level $and, and any of the clauses constrain their
  // documents, then the whole selector is constrained by any one clause's
  // constraint. (Well, by their intersection, but that seems unlikely.)
  if (Array.isArray(selector.$and)) {
    for (let i = 0; i < selector.$and.length; ++i) {
      const subIds = LocalCollection._idsMatchedBySelector(selector.$and[i]);
      if (subIds) {
        return subIds;
      }
    }
  }
  return null;
};
LocalCollection._insertInResults = (query, doc) => {
  const fields = EJSON.clone(doc);
  delete fields._id;
  if (query.ordered) {
    if (!query.sorter) {
      query.addedBefore(doc._id, query.projectionFn(fields), null);
      query.results.push(doc);
    } else {
      const i = LocalCollection._insertInSortedList(query.sorter.getComparator({
        distances: query.distances
      }), query.results, doc);
      let next = query.results[i + 1];
      if (next) {
        next = next._id;
      } else {
        next = null;
      }
      query.addedBefore(doc._id, query.projectionFn(fields), next);
    }
    query.added(doc._id, query.projectionFn(fields));
  } else {
    query.added(doc._id, query.projectionFn(fields));
    query.results.set(doc._id, doc);
  }
};
LocalCollection._insertInSortedList = (cmp, array, value) => {
  if (array.length === 0) {
    array.push(value);
    return 0;
  }
  const i = LocalCollection._binarySearch(cmp, array, value);
  array.splice(i, 0, value);
  return i;
};
LocalCollection._isModificationMod = mod => {
  let isModify = false;
  let isReplace = false;
  Object.keys(mod).forEach(key => {
    if (key.substr(0, 1) === '$') {
      isModify = true;
    } else {
      isReplace = true;
    }
  });
  if (isModify && isReplace) {
    throw new Error('Update parameter cannot have both modifier and non-modifier fields.');
  }
  return isModify;
};

// XXX maybe this should be EJSON.isObject, though EJSON doesn't know about
// RegExp
// XXX note that _type(undefined) === 3!!!!
LocalCollection._isPlainObject = x => {
  return x && LocalCollection._f._type(x) === 3;
};

// XXX need a strategy for passing the binding of $ into this
// function, from the compiled selector
//
// maybe just {key.up.to.just.before.dollarsign: array_index}
//
// XXX atomicity: if one modification fails, do we roll back the whole
// change?
//
// options:
//   - isInsert is set when _modify is being called to compute the document to
//     insert as part of an upsert operation. We use this primarily to figure
//     out when to set the fields in $setOnInsert, if present.
LocalCollection._modify = function (doc, modifier) {
  let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  if (!LocalCollection._isPlainObject(modifier)) {
    throw MinimongoError('Modifier must be an object');
  }

  // Make sure the caller can't mutate our data structures.
  modifier = EJSON.clone(modifier);
  const isModifier = isOperatorObject(modifier);
  const newDoc = isModifier ? EJSON.clone(doc) : modifier;
  if (isModifier) {
    // apply modifiers to the doc.
    Object.keys(modifier).forEach(operator => {
      // Treat $setOnInsert as $set if this is an insert.
      const setOnInsert = options.isInsert && operator === '$setOnInsert';
      const modFunc = MODIFIERS[setOnInsert ? '$set' : operator];
      const operand = modifier[operator];
      if (!modFunc) {
        throw MinimongoError("Invalid modifier specified ".concat(operator));
      }
      Object.keys(operand).forEach(keypath => {
        const arg = operand[keypath];
        if (keypath === '') {
          throw MinimongoError('An empty update path is not valid.');
        }
        const keyparts = keypath.split('.');
        if (!keyparts.every(Boolean)) {
          throw MinimongoError("The update path '".concat(keypath, "' contains an empty field name, ") + 'which is not allowed.');
        }
        const target = findModTarget(newDoc, keyparts, {
          arrayIndices: options.arrayIndices,
          forbidArray: operator === '$rename',
          noCreate: NO_CREATE_MODIFIERS[operator]
        });
        modFunc(target, keyparts.pop(), arg, keypath, newDoc);
      });
    });
    if (doc._id && !EJSON.equals(doc._id, newDoc._id)) {
      throw MinimongoError("After applying the update to the document {_id: \"".concat(doc._id, "\", ...},") + ' the (immutable) field \'_id\' was found to have been altered to ' + "_id: \"".concat(newDoc._id, "\""));
    }
  } else {
    if (doc._id && modifier._id && !EJSON.equals(doc._id, modifier._id)) {
      throw MinimongoError("The _id field cannot be changed from {_id: \"".concat(doc._id, "\"} to ") + "{_id: \"".concat(modifier._id, "\"}"));
    }

    // replace the whole document
    assertHasValidFieldNames(modifier);
  }

  // move new document into place.
  Object.keys(doc).forEach(key => {
    // Note: this used to be for (var key in doc) however, this does not
    // work right in Opera. Deleting from a doc while iterating over it
    // would sometimes cause opera to skip some keys.
    if (key !== '_id') {
      delete doc[key];
    }
  });
  Object.keys(newDoc).forEach(key => {
    doc[key] = newDoc[key];
  });
};
LocalCollection._observeFromObserveChanges = (cursor, observeCallbacks) => {
  const transform = cursor.getTransform() || (doc => doc);
  let suppressed = !!observeCallbacks._suppress_initial;
  let observeChangesCallbacks;
  if (LocalCollection._observeCallbacksAreOrdered(observeCallbacks)) {
    // The "_no_indices" option sets all index arguments to -1 and skips the
    // linear scans required to generate them.  This lets observers that don't
    // need absolute indices benefit from the other features of this API --
    // relative order, transforms, and applyChanges -- without the speed hit.
    const indices = !observeCallbacks._no_indices;
    observeChangesCallbacks = {
      addedBefore(id, fields, before) {
        if (suppressed || !(observeCallbacks.addedAt || observeCallbacks.added)) {
          return;
        }
        const doc = transform(Object.assign(fields, {
          _id: id
        }));
        if (observeCallbacks.addedAt) {
          observeCallbacks.addedAt(doc, indices ? before ? this.docs.indexOf(before) : this.docs.size() : -1, before);
        } else {
          observeCallbacks.added(doc);
        }
      },
      changed(id, fields) {
        if (!(observeCallbacks.changedAt || observeCallbacks.changed)) {
          return;
        }
        let doc = EJSON.clone(this.docs.get(id));
        if (!doc) {
          throw new Error("Unknown id for changed: ".concat(id));
        }
        const oldDoc = transform(EJSON.clone(doc));
        DiffSequence.applyChanges(doc, fields);
        if (observeCallbacks.changedAt) {
          observeCallbacks.changedAt(transform(doc), oldDoc, indices ? this.docs.indexOf(id) : -1);
        } else {
          observeCallbacks.changed(transform(doc), oldDoc);
        }
      },
      movedBefore(id, before) {
        if (!observeCallbacks.movedTo) {
          return;
        }
        const from = indices ? this.docs.indexOf(id) : -1;
        let to = indices ? before ? this.docs.indexOf(before) : this.docs.size() : -1;

        // When not moving backwards, adjust for the fact that removing the
        // document slides everything back one slot.
        if (to > from) {
          --to;
        }
        observeCallbacks.movedTo(transform(EJSON.clone(this.docs.get(id))), from, to, before || null);
      },
      removed(id) {
        if (!(observeCallbacks.removedAt || observeCallbacks.removed)) {
          return;
        }

        // technically maybe there should be an EJSON.clone here, but it's about
        // to be removed from this.docs!
        const doc = transform(this.docs.get(id));
        if (observeCallbacks.removedAt) {
          observeCallbacks.removedAt(doc, indices ? this.docs.indexOf(id) : -1);
        } else {
          observeCallbacks.removed(doc);
        }
      }
    };
  } else {
    observeChangesCallbacks = {
      added(id, fields) {
        if (!suppressed && observeCallbacks.added) {
          observeCallbacks.added(transform(Object.assign(fields, {
            _id: id
          })));
        }
      },
      changed(id, fields) {
        if (observeCallbacks.changed) {
          const oldDoc = this.docs.get(id);
          const doc = EJSON.clone(oldDoc);
          DiffSequence.applyChanges(doc, fields);
          observeCallbacks.changed(transform(doc), transform(EJSON.clone(oldDoc)));
        }
      },
      removed(id) {
        if (observeCallbacks.removed) {
          observeCallbacks.removed(transform(this.docs.get(id)));
        }
      }
    };
  }
  const changeObserver = new LocalCollection._CachingChangeObserver({
    callbacks: observeChangesCallbacks
  });

  // CachingChangeObserver clones all received input on its callbacks
  // So we can mark it as safe to reduce the ejson clones.
  // This is tested by the `mongo-livedata - (extended) scribbling` tests
  changeObserver.applyChange._fromObserve = true;
  const handle = cursor.observeChanges(changeObserver.applyChange, {
    nonMutatingCallbacks: true
  });
  suppressed = false;
  return handle;
};
LocalCollection._observeCallbacksAreOrdered = callbacks => {
  if (callbacks.added && callbacks.addedAt) {
    throw new Error('Please specify only one of added() and addedAt()');
  }
  if (callbacks.changed && callbacks.changedAt) {
    throw new Error('Please specify only one of changed() and changedAt()');
  }
  if (callbacks.removed && callbacks.removedAt) {
    throw new Error('Please specify only one of removed() and removedAt()');
  }
  return !!(callbacks.addedAt || callbacks.changedAt || callbacks.movedTo || callbacks.removedAt);
};
LocalCollection._observeChangesCallbacksAreOrdered = callbacks => {
  if (callbacks.added && callbacks.addedBefore) {
    throw new Error('Please specify only one of added() and addedBefore()');
  }
  return !!(callbacks.addedBefore || callbacks.movedBefore);
};
LocalCollection._removeFromResults = (query, doc) => {
  if (query.ordered) {
    const i = LocalCollection._findInOrderedResults(query, doc);
    query.removed(doc._id);
    query.results.splice(i, 1);
  } else {
    const id = doc._id; // in case callback mutates doc

    query.removed(doc._id);
    query.results.remove(id);
  }
};

// Is this selector just shorthand for lookup by _id?
LocalCollection._selectorIsId = selector => typeof selector === 'number' || typeof selector === 'string' || selector instanceof MongoID.ObjectID;

// Is the selector just lookup by _id (shorthand or not)?
LocalCollection._selectorIsIdPerhapsAsObject = selector => LocalCollection._selectorIsId(selector) || LocalCollection._selectorIsId(selector && selector._id) && Object.keys(selector).length === 1;
LocalCollection._updateInResults = (query, doc, old_doc) => {
  if (!EJSON.equals(doc._id, old_doc._id)) {
    throw new Error('Can\'t change a doc\'s _id while updating');
  }
  const projectionFn = query.projectionFn;
  const changedFields = DiffSequence.makeChangedFields(projectionFn(doc), projectionFn(old_doc));
  if (!query.ordered) {
    if (Object.keys(changedFields).length) {
      query.changed(doc._id, changedFields);
      query.results.set(doc._id, doc);
    }
    return;
  }
  const old_idx = LocalCollection._findInOrderedResults(query, doc);
  if (Object.keys(changedFields).length) {
    query.changed(doc._id, changedFields);
  }
  if (!query.sorter) {
    return;
  }

  // just take it out and put it back in again, and see if the index changes
  query.results.splice(old_idx, 1);
  const new_idx = LocalCollection._insertInSortedList(query.sorter.getComparator({
    distances: query.distances
  }), query.results, doc);
  if (old_idx !== new_idx) {
    let next = query.results[new_idx + 1];
    if (next) {
      next = next._id;
    } else {
      next = null;
    }
    query.movedBefore && query.movedBefore(doc._id, next);
  }
};
const MODIFIERS = {
  $currentDate(target, field, arg) {
    if (typeof arg === 'object' && hasOwn.call(arg, '$type')) {
      if (arg.$type !== 'date') {
        throw MinimongoError('Minimongo does currently only support the date type in ' + '$currentDate modifiers', {
          field
        });
      }
    } else if (arg !== true) {
      throw MinimongoError('Invalid $currentDate modifier', {
        field
      });
    }
    target[field] = new Date();
  },
  $inc(target, field, arg) {
    if (typeof arg !== 'number') {
      throw MinimongoError('Modifier $inc allowed for numbers only', {
        field
      });
    }
    if (field in target) {
      if (typeof target[field] !== 'number') {
        throw MinimongoError('Cannot apply $inc modifier to non-number', {
          field
        });
      }
      target[field] += arg;
    } else {
      target[field] = arg;
    }
  },
  $min(target, field, arg) {
    if (typeof arg !== 'number') {
      throw MinimongoError('Modifier $min allowed for numbers only', {
        field
      });
    }
    if (field in target) {
      if (typeof target[field] !== 'number') {
        throw MinimongoError('Cannot apply $min modifier to non-number', {
          field
        });
      }
      if (target[field] > arg) {
        target[field] = arg;
      }
    } else {
      target[field] = arg;
    }
  },
  $max(target, field, arg) {
    if (typeof arg !== 'number') {
      throw MinimongoError('Modifier $max allowed for numbers only', {
        field
      });
    }
    if (field in target) {
      if (typeof target[field] !== 'number') {
        throw MinimongoError('Cannot apply $max modifier to non-number', {
          field
        });
      }
      if (target[field] < arg) {
        target[field] = arg;
      }
    } else {
      target[field] = arg;
    }
  },
  $mul(target, field, arg) {
    if (typeof arg !== 'number') {
      throw MinimongoError('Modifier $mul allowed for numbers only', {
        field
      });
    }
    if (field in target) {
      if (typeof target[field] !== 'number') {
        throw MinimongoError('Cannot apply $mul modifier to non-number', {
          field
        });
      }
      target[field] *= arg;
    } else {
      target[field] = 0;
    }
  },
  $rename(target, field, arg, keypath, doc) {
    // no idea why mongo has this restriction..
    if (keypath === arg) {
      throw MinimongoError('$rename source must differ from target', {
        field
      });
    }
    if (target === null) {
      throw MinimongoError('$rename source field invalid', {
        field
      });
    }
    if (typeof arg !== 'string') {
      throw MinimongoError('$rename target must be a string', {
        field
      });
    }
    if (arg.includes('\0')) {
      // Null bytes are not allowed in Mongo field names
      // https://docs.mongodb.com/manual/reference/limits/#Restrictions-on-Field-Names
      throw MinimongoError('The \'to\' field for $rename cannot contain an embedded null byte', {
        field
      });
    }
    if (target === undefined) {
      return;
    }
    const object = target[field];
    delete target[field];
    const keyparts = arg.split('.');
    const target2 = findModTarget(doc, keyparts, {
      forbidArray: true
    });
    if (target2 === null) {
      throw MinimongoError('$rename target field invalid', {
        field
      });
    }
    target2[keyparts.pop()] = object;
  },
  $set(target, field, arg) {
    if (target !== Object(target)) {
      // not an array or an object
      const error = MinimongoError('Cannot set property on non-object field', {
        field
      });
      error.setPropertyError = true;
      throw error;
    }
    if (target === null) {
      const error = MinimongoError('Cannot set property on null', {
        field
      });
      error.setPropertyError = true;
      throw error;
    }
    assertHasValidFieldNames(arg);
    target[field] = arg;
  },
  $setOnInsert(target, field, arg) {
    // converted to `$set` in `_modify`
  },
  $unset(target, field, arg) {
    if (target !== undefined) {
      if (target instanceof Array) {
        if (field in target) {
          target[field] = null;
        }
      } else {
        delete target[field];
      }
    }
  },
  $push(target, field, arg) {
    if (target[field] === undefined) {
      target[field] = [];
    }
    if (!(target[field] instanceof Array)) {
      throw MinimongoError('Cannot apply $push modifier to non-array', {
        field
      });
    }
    if (!(arg && arg.$each)) {
      // Simple mode: not $each
      assertHasValidFieldNames(arg);
      target[field].push(arg);
      return;
    }

    // Fancy mode: $each (and maybe $slice and $sort and $position)
    const toPush = arg.$each;
    if (!(toPush instanceof Array)) {
      throw MinimongoError('$each must be an array', {
        field
      });
    }
    assertHasValidFieldNames(toPush);

    // Parse $position
    let position = undefined;
    if ('$position' in arg) {
      if (typeof arg.$position !== 'number') {
        throw MinimongoError('$position must be a numeric value', {
          field
        });
      }

      // XXX should check to make sure integer
      if (arg.$position < 0) {
        throw MinimongoError('$position in $push must be zero or positive', {
          field
        });
      }
      position = arg.$position;
    }

    // Parse $slice.
    let slice = undefined;
    if ('$slice' in arg) {
      if (typeof arg.$slice !== 'number') {
        throw MinimongoError('$slice must be a numeric value', {
          field
        });
      }

      // XXX should check to make sure integer
      slice = arg.$slice;
    }

    // Parse $sort.
    let sortFunction = undefined;
    if (arg.$sort) {
      if (slice === undefined) {
        throw MinimongoError('$sort requires $slice to be present', {
          field
        });
      }

      // XXX this allows us to use a $sort whose value is an array, but that's
      // actually an extension of the Node driver, so it won't work
      // server-side. Could be confusing!
      // XXX is it correct that we don't do geo-stuff here?
      sortFunction = new Minimongo.Sorter(arg.$sort).getComparator();
      toPush.forEach(element => {
        if (LocalCollection._f._type(element) !== 3) {
          throw MinimongoError('$push like modifiers using $sort require all elements to be ' + 'objects', {
            field
          });
        }
      });
    }

    // Actually push.
    if (position === undefined) {
      toPush.forEach(element => {
        target[field].push(element);
      });
    } else {
      const spliceArguments = [position, 0];
      toPush.forEach(element => {
        spliceArguments.push(element);
      });
      target[field].splice(...spliceArguments);
    }

    // Actually sort.
    if (sortFunction) {
      target[field].sort(sortFunction);
    }

    // Actually slice.
    if (slice !== undefined) {
      if (slice === 0) {
        target[field] = []; // differs from Array.slice!
      } else if (slice < 0) {
        target[field] = target[field].slice(slice);
      } else {
        target[field] = target[field].slice(0, slice);
      }
    }
  },
  $pushAll(target, field, arg) {
    if (!(typeof arg === 'object' && arg instanceof Array)) {
      throw MinimongoError('Modifier $pushAll/pullAll allowed for arrays only');
    }
    assertHasValidFieldNames(arg);
    const toPush = target[field];
    if (toPush === undefined) {
      target[field] = arg;
    } else if (!(toPush instanceof Array)) {
      throw MinimongoError('Cannot apply $pushAll modifier to non-array', {
        field
      });
    } else {
      toPush.push(...arg);
    }
  },
  $addToSet(target, field, arg) {
    let isEach = false;
    if (typeof arg === 'object') {
      // check if first key is '$each'
      const keys = Object.keys(arg);
      if (keys[0] === '$each') {
        isEach = true;
      }
    }
    const values = isEach ? arg.$each : [arg];
    assertHasValidFieldNames(values);
    const toAdd = target[field];
    if (toAdd === undefined) {
      target[field] = values;
    } else if (!(toAdd instanceof Array)) {
      throw MinimongoError('Cannot apply $addToSet modifier to non-array', {
        field
      });
    } else {
      values.forEach(value => {
        if (toAdd.some(element => LocalCollection._f._equal(value, element))) {
          return;
        }
        toAdd.push(value);
      });
    }
  },
  $pop(target, field, arg) {
    if (target === undefined) {
      return;
    }
    const toPop = target[field];
    if (toPop === undefined) {
      return;
    }
    if (!(toPop instanceof Array)) {
      throw MinimongoError('Cannot apply $pop modifier to non-array', {
        field
      });
    }
    if (typeof arg === 'number' && arg < 0) {
      toPop.splice(0, 1);
    } else {
      toPop.pop();
    }
  },
  $pull(target, field, arg) {
    if (target === undefined) {
      return;
    }
    const toPull = target[field];
    if (toPull === undefined) {
      return;
    }
    if (!(toPull instanceof Array)) {
      throw MinimongoError('Cannot apply $pull/pullAll modifier to non-array', {
        field
      });
    }
    let out;
    if (arg != null && typeof arg === 'object' && !(arg instanceof Array)) {
      // XXX would be much nicer to compile this once, rather than
      // for each document we modify.. but usually we're not
      // modifying that many documents, so we'll let it slide for
      // now

      // XXX Minimongo.Matcher isn't up for the job, because we need
      // to permit stuff like {$pull: {a: {$gt: 4}}}.. something
      // like {$gt: 4} is not normally a complete selector.
      // same issue as $elemMatch possibly?
      const matcher = new Minimongo.Matcher(arg);
      out = toPull.filter(element => !matcher.documentMatches(element).result);
    } else {
      out = toPull.filter(element => !LocalCollection._f._equal(element, arg));
    }
    target[field] = out;
  },
  $pullAll(target, field, arg) {
    if (!(typeof arg === 'object' && arg instanceof Array)) {
      throw MinimongoError('Modifier $pushAll/pullAll allowed for arrays only', {
        field
      });
    }
    if (target === undefined) {
      return;
    }
    const toPull = target[field];
    if (toPull === undefined) {
      return;
    }
    if (!(toPull instanceof Array)) {
      throw MinimongoError('Cannot apply $pull/pullAll modifier to non-array', {
        field
      });
    }
    target[field] = toPull.filter(object => !arg.some(element => LocalCollection._f._equal(object, element)));
  },
  $bit(target, field, arg) {
    // XXX mongo only supports $bit on integers, and we only support
    // native javascript numbers (doubles) so far, so we can't support $bit
    throw MinimongoError('$bit is not supported', {
      field
    });
  },
  $v() {
    // As discussed in https://github.com/meteor/meteor/issues/9623,
    // the `$v` operator is not needed by Meteor, but problems can occur if
    // it's not at least callable (as of Mongo >= 3.6). It's defined here as
    // a no-op to work around these problems.
  }
};
const NO_CREATE_MODIFIERS = {
  $pop: true,
  $pull: true,
  $pullAll: true,
  $rename: true,
  $unset: true
};

// Make sure field names do not contain Mongo restricted
// characters ('.', '$', '\0').
// https://docs.mongodb.com/manual/reference/limits/#Restrictions-on-Field-Names
const invalidCharMsg = {
  $: 'start with \'$\'',
  '.': 'contain \'.\'',
  '\0': 'contain null bytes'
};

// checks if all field names in an object are valid
function assertHasValidFieldNames(doc) {
  if (doc && typeof doc === 'object') {
    JSON.stringify(doc, (key, value) => {
      assertIsValidFieldName(key);
      return value;
    });
  }
}
function assertIsValidFieldName(key) {
  let match;
  if (typeof key === 'string' && (match = key.match(/^\$|\.|\0/))) {
    throw MinimongoError("Key ".concat(key, " must not ").concat(invalidCharMsg[match[0]]));
  }
}

// for a.b.c.2.d.e, keyparts should be ['a', 'b', 'c', '2', 'd', 'e'],
// and then you would operate on the 'e' property of the returned
// object.
//
// if options.noCreate is falsey, creates intermediate levels of
// structure as necessary, like mkdir -p (and raises an exception if
// that would mean giving a non-numeric property to an array.) if
// options.noCreate is true, return undefined instead.
//
// may modify the last element of keyparts to signal to the caller that it needs
// to use a different value to index into the returned object (for example,
// ['a', '01'] -> ['a', 1]).
//
// if forbidArray is true, return null if the keypath goes through an array.
//
// if options.arrayIndices is set, use its first element for the (first) '$' in
// the path.
function findModTarget(doc, keyparts) {
  let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  let usedArrayIndex = false;
  for (let i = 0; i < keyparts.length; i++) {
    const last = i === keyparts.length - 1;
    let keypart = keyparts[i];
    if (!isIndexable(doc)) {
      if (options.noCreate) {
        return undefined;
      }
      const error = MinimongoError("cannot use the part '".concat(keypart, "' to traverse ").concat(doc));
      error.setPropertyError = true;
      throw error;
    }
    if (doc instanceof Array) {
      if (options.forbidArray) {
        return null;
      }
      if (keypart === '$') {
        if (usedArrayIndex) {
          throw MinimongoError('Too many positional (i.e. \'$\') elements');
        }
        if (!options.arrayIndices || !options.arrayIndices.length) {
          throw MinimongoError('The positional operator did not find the match needed from the ' + 'query');
        }
        keypart = options.arrayIndices[0];
        usedArrayIndex = true;
      } else if (isNumericKey(keypart)) {
        keypart = parseInt(keypart);
      } else {
        if (options.noCreate) {
          return undefined;
        }
        throw MinimongoError("can't append to array using string field name [".concat(keypart, "]"));
      }
      if (last) {
        keyparts[i] = keypart; // handle 'a.01'
      }

      if (options.noCreate && keypart >= doc.length) {
        return undefined;
      }
      while (doc.length < keypart) {
        doc.push(null);
      }
      if (!last) {
        if (doc.length === keypart) {
          doc.push({});
        } else if (typeof doc[keypart] !== 'object') {
          throw MinimongoError("can't modify field '".concat(keyparts[i + 1], "' of list value ") + JSON.stringify(doc[keypart]));
        }
      }
    } else {
      assertIsValidFieldName(keypart);
      if (!(keypart in doc)) {
        if (options.noCreate) {
          return undefined;
        }
        if (!last) {
          doc[keypart] = {};
        }
      }
    }
    if (last) {
      return doc;
    }
    doc = doc[keypart];
  }

  // notreached
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"matcher.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/minimongo/matcher.js                                                                                       //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
var _Package$mongoDecima;
module.export({
  default: () => Matcher
});
let LocalCollection;
module.link("./local_collection.js", {
  default(v) {
    LocalCollection = v;
  }
}, 0);
let compileDocumentSelector, hasOwn, nothingMatcher;
module.link("./common.js", {
  compileDocumentSelector(v) {
    compileDocumentSelector = v;
  },
  hasOwn(v) {
    hasOwn = v;
  },
  nothingMatcher(v) {
    nothingMatcher = v;
  }
}, 1);
const Decimal = ((_Package$mongoDecima = Package['mongo-decimal']) === null || _Package$mongoDecima === void 0 ? void 0 : _Package$mongoDecima.Decimal) || class DecimalStub {};

// The minimongo selector compiler!

// Terminology:
//  - a 'selector' is the EJSON object representing a selector
//  - a 'matcher' is its compiled form (whether a full Minimongo.Matcher
//    object or one of the component lambdas that matches parts of it)
//  - a 'result object' is an object with a 'result' field and maybe
//    distance and arrayIndices.
//  - a 'branched value' is an object with a 'value' field and maybe
//    'dontIterate' and 'arrayIndices'.
//  - a 'document' is a top-level object that can be stored in a collection.
//  - a 'lookup function' is a function that takes in a document and returns
//    an array of 'branched values'.
//  - a 'branched matcher' maps from an array of branched values to a result
//    object.
//  - an 'element matcher' maps from a single value to a bool.

// Main entry point.
//   var matcher = new Minimongo.Matcher({a: {$gt: 5}});
//   if (matcher.documentMatches({a: 7})) ...
class Matcher {
  constructor(selector, isUpdate) {
    // A set (object mapping string -> *) of all of the document paths looked
    // at by the selector. Also includes the empty string if it may look at any
    // path (eg, $where).
    this._paths = {};
    // Set to true if compilation finds a $near.
    this._hasGeoQuery = false;
    // Set to true if compilation finds a $where.
    this._hasWhere = false;
    // Set to false if compilation finds anything other than a simple equality
    // or one or more of '$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin' used
    // with scalars as operands.
    this._isSimple = true;
    // Set to a dummy document which always matches this Matcher. Or set to null
    // if such document is too hard to find.
    this._matchingDocument = undefined;
    // A clone of the original selector. It may just be a function if the user
    // passed in a function; otherwise is definitely an object (eg, IDs are
    // translated into {_id: ID} first. Used by canBecomeTrueByModifier and
    // Sorter._useWithMatcher.
    this._selector = null;
    this._docMatcher = this._compileSelector(selector);
    // Set to true if selection is done for an update operation
    // Default is false
    // Used for $near array update (issue #3599)
    this._isUpdate = isUpdate;
  }
  documentMatches(doc) {
    if (doc !== Object(doc)) {
      throw Error('documentMatches needs a document');
    }
    return this._docMatcher(doc);
  }
  hasGeoQuery() {
    return this._hasGeoQuery;
  }
  hasWhere() {
    return this._hasWhere;
  }
  isSimple() {
    return this._isSimple;
  }

  // Given a selector, return a function that takes one argument, a
  // document. It returns a result object.
  _compileSelector(selector) {
    // you can pass a literal function instead of a selector
    if (selector instanceof Function) {
      this._isSimple = false;
      this._selector = selector;
      this._recordPathUsed('');
      return doc => ({
        result: !!selector.call(doc)
      });
    }

    // shorthand -- scalar _id
    if (LocalCollection._selectorIsId(selector)) {
      this._selector = {
        _id: selector
      };
      this._recordPathUsed('_id');
      return doc => ({
        result: EJSON.equals(doc._id, selector)
      });
    }

    // protect against dangerous selectors.  falsey and {_id: falsey} are both
    // likely programmer error, and not what you want, particularly for
    // destructive operations.
    if (!selector || hasOwn.call(selector, '_id') && !selector._id) {
      this._isSimple = false;
      return nothingMatcher;
    }

    // Top level can't be an array or true or binary.
    if (Array.isArray(selector) || EJSON.isBinary(selector) || typeof selector === 'boolean') {
      throw new Error("Invalid selector: ".concat(selector));
    }
    this._selector = EJSON.clone(selector);
    return compileDocumentSelector(selector, this, {
      isRoot: true
    });
  }

  // Returns a list of key paths the given selector is looking for. It includes
  // the empty string if there is a $where.
  _getPaths() {
    return Object.keys(this._paths);
  }
  _recordPathUsed(path) {
    this._paths[path] = true;
  }
}
// helpers used by compiled selector code
LocalCollection._f = {
  // XXX for _all and _in, consider building 'inquery' at compile time..
  _type(v) {
    if (typeof v === 'number') {
      return 1;
    }
    if (typeof v === 'string') {
      return 2;
    }
    if (typeof v === 'boolean') {
      return 8;
    }
    if (Array.isArray(v)) {
      return 4;
    }
    if (v === null) {
      return 10;
    }

    // note that typeof(/x/) === "object"
    if (v instanceof RegExp) {
      return 11;
    }
    if (typeof v === 'function') {
      return 13;
    }
    if (v instanceof Date) {
      return 9;
    }
    if (EJSON.isBinary(v)) {
      return 5;
    }
    if (v instanceof MongoID.ObjectID) {
      return 7;
    }
    if (v instanceof Decimal) {
      return 1;
    }

    // object
    return 3;

    // XXX support some/all of these:
    // 14, symbol
    // 15, javascript code with scope
    // 16, 18: 32-bit/64-bit integer
    // 17, timestamp
    // 255, minkey
    // 127, maxkey
  },

  // deep equality test: use for literal document and array matches
  _equal(a, b) {
    return EJSON.equals(a, b, {
      keyOrderSensitive: true
    });
  },
  // maps a type code to a value that can be used to sort values of different
  // types
  _typeorder(t) {
    // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types
    // XXX what is the correct sort position for Javascript code?
    // ('100' in the matrix below)
    // XXX minkey/maxkey
    return [-1,
    // (not a type)
    1,
    // number
    2,
    // string
    3,
    // object
    4,
    // array
    5,
    // binary
    -1,
    // deprecated
    6,
    // ObjectID
    7,
    // bool
    8,
    // Date
    0,
    // null
    9,
    // RegExp
    -1,
    // deprecated
    100,
    // JS code
    2,
    // deprecated (symbol)
    100,
    // JS code
    1,
    // 32-bit int
    8,
    // Mongo timestamp
    1 // 64-bit int
    ][t];
  },
  // compare two values of unknown type according to BSON ordering
  // semantics. (as an extension, consider 'undefined' to be less than
  // any other value.) return negative if a is less, positive if b is
  // less, or 0 if equal
  _cmp(a, b) {
    if (a === undefined) {
      return b === undefined ? 0 : -1;
    }
    if (b === undefined) {
      return 1;
    }
    let ta = LocalCollection._f._type(a);
    let tb = LocalCollection._f._type(b);
    const oa = LocalCollection._f._typeorder(ta);
    const ob = LocalCollection._f._typeorder(tb);
    if (oa !== ob) {
      return oa < ob ? -1 : 1;
    }

    // XXX need to implement this if we implement Symbol or integers, or
    // Timestamp
    if (ta !== tb) {
      throw Error('Missing type coercion logic in _cmp');
    }
    if (ta === 7) {
      // ObjectID
      // Convert to string.
      ta = tb = 2;
      a = a.toHexString();
      b = b.toHexString();
    }
    if (ta === 9) {
      // Date
      // Convert to millis.
      ta = tb = 1;
      a = isNaN(a) ? 0 : a.getTime();
      b = isNaN(b) ? 0 : b.getTime();
    }
    if (ta === 1) {
      // double
      if (a instanceof Decimal) {
        return a.minus(b).toNumber();
      } else {
        return a - b;
      }
    }
    if (tb === 2)
      // string
      return a < b ? -1 : a === b ? 0 : 1;
    if (ta === 3) {
      // Object
      // this could be much more efficient in the expected case ...
      const toArray = object => {
        const result = [];
        Object.keys(object).forEach(key => {
          result.push(key, object[key]);
        });
        return result;
      };
      return LocalCollection._f._cmp(toArray(a), toArray(b));
    }
    if (ta === 4) {
      // Array
      for (let i = 0;; i++) {
        if (i === a.length) {
          return i === b.length ? 0 : -1;
        }
        if (i === b.length) {
          return 1;
        }
        const s = LocalCollection._f._cmp(a[i], b[i]);
        if (s !== 0) {
          return s;
        }
      }
    }
    if (ta === 5) {
      // binary
      // Surprisingly, a small binary blob is always less than a large one in
      // Mongo.
      if (a.length !== b.length) {
        return a.length - b.length;
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i] < b[i]) {
          return -1;
        }
        if (a[i] > b[i]) {
          return 1;
        }
      }
      return 0;
    }
    if (ta === 8) {
      // boolean
      if (a) {
        return b ? 0 : 1;
      }
      return b ? -1 : 0;
    }
    if (ta === 10)
      // null
      return 0;
    if (ta === 11)
      // regexp
      throw Error('Sorting not supported on regular expression'); // XXX

    // 13: javascript code
    // 14: symbol
    // 15: javascript code with scope
    // 16: 32-bit integer
    // 17: timestamp
    // 18: 64-bit integer
    // 255: minkey
    // 127: maxkey
    if (ta === 13)
      // javascript code
      throw Error('Sorting not supported on Javascript code'); // XXX

    throw Error('Unknown type to sort');
  }
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"minimongo_common.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/minimongo/minimongo_common.js                                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let LocalCollection_;
module.link("./local_collection.js", {
  default(v) {
    LocalCollection_ = v;
  }
}, 0);
let Matcher;
module.link("./matcher.js", {
  default(v) {
    Matcher = v;
  }
}, 1);
let Sorter;
module.link("./sorter.js", {
  default(v) {
    Sorter = v;
  }
}, 2);
LocalCollection = LocalCollection_;
Minimongo = {
  LocalCollection: LocalCollection_,
  Matcher,
  Sorter
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"observe_handle.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/minimongo/observe_handle.js                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  default: () => ObserveHandle
});
class ObserveHandle {}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"sorter.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/minimongo/sorter.js                                                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  default: () => Sorter
});
let ELEMENT_OPERATORS, equalityElementMatcher, expandArraysInBranches, hasOwn, isOperatorObject, makeLookupFunction, regexpElementMatcher;
module.link("./common.js", {
  ELEMENT_OPERATORS(v) {
    ELEMENT_OPERATORS = v;
  },
  equalityElementMatcher(v) {
    equalityElementMatcher = v;
  },
  expandArraysInBranches(v) {
    expandArraysInBranches = v;
  },
  hasOwn(v) {
    hasOwn = v;
  },
  isOperatorObject(v) {
    isOperatorObject = v;
  },
  makeLookupFunction(v) {
    makeLookupFunction = v;
  },
  regexpElementMatcher(v) {
    regexpElementMatcher = v;
  }
}, 0);
class Sorter {
  constructor(spec) {
    this._sortSpecParts = [];
    this._sortFunction = null;
    const addSpecPart = (path, ascending) => {
      if (!path) {
        throw Error('sort keys must be non-empty');
      }
      if (path.charAt(0) === '$') {
        throw Error("unsupported sort key: ".concat(path));
      }
      this._sortSpecParts.push({
        ascending,
        lookup: makeLookupFunction(path, {
          forSort: true
        }),
        path
      });
    };
    if (spec instanceof Array) {
      spec.forEach(element => {
        if (typeof element === 'string') {
          addSpecPart(element, true);
        } else {
          addSpecPart(element[0], element[1] !== 'desc');
        }
      });
    } else if (typeof spec === 'object') {
      Object.keys(spec).forEach(key => {
        addSpecPart(key, spec[key] >= 0);
      });
    } else if (typeof spec === 'function') {
      this._sortFunction = spec;
    } else {
      throw Error("Bad sort specification: ".concat(JSON.stringify(spec)));
    }

    // If a function is specified for sorting, we skip the rest.
    if (this._sortFunction) {
      return;
    }

    // To implement affectedByModifier, we piggy-back on top of Matcher's
    // affectedByModifier code; we create a selector that is affected by the
    // same modifiers as this sort order. This is only implemented on the
    // server.
    if (this.affectedByModifier) {
      const selector = {};
      this._sortSpecParts.forEach(spec => {
        selector[spec.path] = 1;
      });
      this._selectorForAffectedByModifier = new Minimongo.Matcher(selector);
    }
    this._keyComparator = composeComparators(this._sortSpecParts.map((spec, i) => this._keyFieldComparator(i)));
  }
  getComparator(options) {
    // If sort is specified or have no distances, just use the comparator from
    // the source specification (which defaults to "everything is equal".
    // issue #3599
    // https://docs.mongodb.com/manual/reference/operator/query/near/#sort-operation
    // sort effectively overrides $near
    if (this._sortSpecParts.length || !options || !options.distances) {
      return this._getBaseComparator();
    }
    const distances = options.distances;

    // Return a comparator which compares using $near distances.
    return (a, b) => {
      if (!distances.has(a._id)) {
        throw Error("Missing distance for ".concat(a._id));
      }
      if (!distances.has(b._id)) {
        throw Error("Missing distance for ".concat(b._id));
      }
      return distances.get(a._id) - distances.get(b._id);
    };
  }

  // Takes in two keys: arrays whose lengths match the number of spec
  // parts. Returns negative, 0, or positive based on using the sort spec to
  // compare fields.
  _compareKeys(key1, key2) {
    if (key1.length !== this._sortSpecParts.length || key2.length !== this._sortSpecParts.length) {
      throw Error('Key has wrong length');
    }
    return this._keyComparator(key1, key2);
  }

  // Iterates over each possible "key" from doc (ie, over each branch), calling
  // 'cb' with the key.
  _generateKeysFromDoc(doc, cb) {
    if (this._sortSpecParts.length === 0) {
      throw new Error('can\'t generate keys without a spec');
    }
    const pathFromIndices = indices => "".concat(indices.join(','), ",");
    let knownPaths = null;

    // maps index -> ({'' -> value} or {path -> value})
    const valuesByIndexAndPath = this._sortSpecParts.map(spec => {
      // Expand any leaf arrays that we find, and ignore those arrays
      // themselves.  (We never sort based on an array itself.)
      let branches = expandArraysInBranches(spec.lookup(doc), true);

      // If there are no values for a key (eg, key goes to an empty array),
      // pretend we found one undefined value.
      if (!branches.length) {
        branches = [{
          value: void 0
        }];
      }
      const element = Object.create(null);
      let usedPaths = false;
      branches.forEach(branch => {
        if (!branch.arrayIndices) {
          // If there are no array indices for a branch, then it must be the
          // only branch, because the only thing that produces multiple branches
          // is the use of arrays.
          if (branches.length > 1) {
            throw Error('multiple branches but no array used?');
          }
          element[''] = branch.value;
          return;
        }
        usedPaths = true;
        const path = pathFromIndices(branch.arrayIndices);
        if (hasOwn.call(element, path)) {
          throw Error("duplicate path: ".concat(path));
        }
        element[path] = branch.value;

        // If two sort fields both go into arrays, they have to go into the
        // exact same arrays and we have to find the same paths.  This is
        // roughly the same condition that makes MongoDB throw this strange
        // error message.  eg, the main thing is that if sort spec is {a: 1,
        // b:1} then a and b cannot both be arrays.
        //
        // (In MongoDB it seems to be OK to have {a: 1, 'a.x.y': 1} where 'a'
        // and 'a.x.y' are both arrays, but we don't allow this for now.
        // #NestedArraySort
        // XXX achieve full compatibility here
        if (knownPaths && !hasOwn.call(knownPaths, path)) {
          throw Error('cannot index parallel arrays');
        }
      });
      if (knownPaths) {
        // Similarly to above, paths must match everywhere, unless this is a
        // non-array field.
        if (!hasOwn.call(element, '') && Object.keys(knownPaths).length !== Object.keys(element).length) {
          throw Error('cannot index parallel arrays!');
        }
      } else if (usedPaths) {
        knownPaths = {};
        Object.keys(element).forEach(path => {
          knownPaths[path] = true;
        });
      }
      return element;
    });
    if (!knownPaths) {
      // Easy case: no use of arrays.
      const soleKey = valuesByIndexAndPath.map(values => {
        if (!hasOwn.call(values, '')) {
          throw Error('no value in sole key case?');
        }
        return values[''];
      });
      cb(soleKey);
      return;
    }
    Object.keys(knownPaths).forEach(path => {
      const key = valuesByIndexAndPath.map(values => {
        if (hasOwn.call(values, '')) {
          return values[''];
        }
        if (!hasOwn.call(values, path)) {
          throw Error('missing path?');
        }
        return values[path];
      });
      cb(key);
    });
  }

  // Returns a comparator that represents the sort specification (but not
  // including a possible geoquery distance tie-breaker).
  _getBaseComparator() {
    if (this._sortFunction) {
      return this._sortFunction;
    }

    // If we're only sorting on geoquery distance and no specs, just say
    // everything is equal.
    if (!this._sortSpecParts.length) {
      return (doc1, doc2) => 0;
    }
    return (doc1, doc2) => {
      const key1 = this._getMinKeyFromDoc(doc1);
      const key2 = this._getMinKeyFromDoc(doc2);
      return this._compareKeys(key1, key2);
    };
  }

  // Finds the minimum key from the doc, according to the sort specs.  (We say
  // "minimum" here but this is with respect to the sort spec, so "descending"
  // sort fields mean we're finding the max for that field.)
  //
  // Note that this is NOT "find the minimum value of the first field, the
  // minimum value of the second field, etc"... it's "choose the
  // lexicographically minimum value of the key vector, allowing only keys which
  // you can find along the same paths".  ie, for a doc {a: [{x: 0, y: 5}, {x:
  // 1, y: 3}]} with sort spec {'a.x': 1, 'a.y': 1}, the only keys are [0,5] and
  // [1,3], and the minimum key is [0,5]; notably, [0,3] is NOT a key.
  _getMinKeyFromDoc(doc) {
    let minKey = null;
    this._generateKeysFromDoc(doc, key => {
      if (minKey === null) {
        minKey = key;
        return;
      }
      if (this._compareKeys(key, minKey) < 0) {
        minKey = key;
      }
    });
    return minKey;
  }
  _getPaths() {
    return this._sortSpecParts.map(part => part.path);
  }

  // Given an index 'i', returns a comparator that compares two key arrays based
  // on field 'i'.
  _keyFieldComparator(i) {
    const invert = !this._sortSpecParts[i].ascending;
    return (key1, key2) => {
      const compare = LocalCollection._f._cmp(key1[i], key2[i]);
      return invert ? -compare : compare;
    };
  }
}
// Given an array of comparators
// (functions (a,b)->(negative or positive or zero)), returns a single
// comparator which uses each comparator in order and returns the first
// non-zero value.
function composeComparators(comparatorArray) {
  return (a, b) => {
    for (let i = 0; i < comparatorArray.length; ++i) {
      const compare = comparatorArray[i](a, b);
      if (compare !== 0) {
        return compare;
      }
    }
    return 0;
  };
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

var exports = require("/node_modules/meteor/minimongo/minimongo_server.js");

/* Exports */
Package._define("minimongo", exports, {
  LocalCollection: LocalCollection,
  Minimongo: Minimongo,
  MinimongoTest: MinimongoTest,
  MinimongoError: MinimongoError
});

})();

//# sourceURL=meteor://💻app/packages/minimongo.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbWluaW1vbmdvL21pbmltb25nb19zZXJ2ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9jb21tb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9jb25zdGFudHMuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9jdXJzb3IuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9sb2NhbF9jb2xsZWN0aW9uLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9taW5pbW9uZ28vbWF0Y2hlci5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbWluaW1vbmdvL21pbmltb25nb19jb21tb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21pbmltb25nby9vYnNlcnZlX2hhbmRsZS5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbWluaW1vbmdvL3NvcnRlci5qcyJdLCJuYW1lcyI6WyJtb2R1bGUiLCJsaW5rIiwiaGFzT3duIiwiaXNOdW1lcmljS2V5IiwiaXNPcGVyYXRvck9iamVjdCIsInBhdGhzVG9UcmVlIiwicHJvamVjdGlvbkRldGFpbHMiLCJ2IiwiTWluaW1vbmdvIiwiX3BhdGhzRWxpZGluZ051bWVyaWNLZXlzIiwicGF0aHMiLCJtYXAiLCJwYXRoIiwic3BsaXQiLCJmaWx0ZXIiLCJwYXJ0Iiwiam9pbiIsIk1hdGNoZXIiLCJwcm90b3R5cGUiLCJhZmZlY3RlZEJ5TW9kaWZpZXIiLCJtb2RpZmllciIsIk9iamVjdCIsImFzc2lnbiIsIiRzZXQiLCIkdW5zZXQiLCJtZWFuaW5nZnVsUGF0aHMiLCJfZ2V0UGF0aHMiLCJtb2RpZmllZFBhdGhzIiwiY29uY2F0Iiwia2V5cyIsInNvbWUiLCJtb2QiLCJtZWFuaW5nZnVsUGF0aCIsInNlbCIsImkiLCJqIiwibGVuZ3RoIiwiY2FuQmVjb21lVHJ1ZUJ5TW9kaWZpZXIiLCJpc1NpbXBsZSIsIm1vZGlmaWVyUGF0aHMiLCJwYXRoSGFzTnVtZXJpY0tleXMiLCJleHBlY3RlZFNjYWxhcklzT2JqZWN0IiwiX3NlbGVjdG9yIiwibW9kaWZpZXJQYXRoIiwic3RhcnRzV2l0aCIsIm1hdGNoaW5nRG9jdW1lbnQiLCJFSlNPTiIsImNsb25lIiwiTG9jYWxDb2xsZWN0aW9uIiwiX21vZGlmeSIsImVycm9yIiwibmFtZSIsInNldFByb3BlcnR5RXJyb3IiLCJkb2N1bWVudE1hdGNoZXMiLCJyZXN1bHQiLCJjb21iaW5lSW50b1Byb2plY3Rpb24iLCJwcm9qZWN0aW9uIiwic2VsZWN0b3JQYXRocyIsImluY2x1ZGVzIiwiY29tYmluZUltcG9ydGFudFBhdGhzSW50b1Byb2plY3Rpb24iLCJfbWF0Y2hpbmdEb2N1bWVudCIsInVuZGVmaW5lZCIsImZhbGxiYWNrIiwidmFsdWVTZWxlY3RvciIsIiRlcSIsIiRpbiIsIm1hdGNoZXIiLCJwbGFjZWhvbGRlciIsImZpbmQiLCJvbmx5Q29udGFpbnNLZXlzIiwibG93ZXJCb3VuZCIsIkluZmluaXR5IiwidXBwZXJCb3VuZCIsImZvckVhY2giLCJvcCIsImNhbGwiLCJtaWRkbGUiLCJ4IiwiU29ydGVyIiwiX3NlbGVjdG9yRm9yQWZmZWN0ZWRCeU1vZGlmaWVyIiwiZGV0YWlscyIsInRyZWUiLCJub2RlIiwiZnVsbFBhdGgiLCJtZXJnZWRQcm9qZWN0aW9uIiwidHJlZVRvUGF0aHMiLCJpbmNsdWRpbmciLCJtZXJnZWRFeGNsUHJvamVjdGlvbiIsImdldFBhdGhzIiwic2VsZWN0b3IiLCJfcGF0aHMiLCJvYmoiLCJldmVyeSIsImsiLCJwcmVmaXgiLCJrZXkiLCJ2YWx1ZSIsImV4cG9ydCIsIkVMRU1FTlRfT1BFUkFUT1JTIiwiY29tcGlsZURvY3VtZW50U2VsZWN0b3IiLCJlcXVhbGl0eUVsZW1lbnRNYXRjaGVyIiwiZXhwYW5kQXJyYXlzSW5CcmFuY2hlcyIsImlzSW5kZXhhYmxlIiwibWFrZUxvb2t1cEZ1bmN0aW9uIiwibm90aGluZ01hdGNoZXIiLCJwb3B1bGF0ZURvY3VtZW50V2l0aFF1ZXJ5RmllbGRzIiwicmVnZXhwRWxlbWVudE1hdGNoZXIiLCJkZWZhdWx0IiwiaGFzT3duUHJvcGVydHkiLCIkbHQiLCJtYWtlSW5lcXVhbGl0eSIsImNtcFZhbHVlIiwiJGd0IiwiJGx0ZSIsIiRndGUiLCIkbW9kIiwiY29tcGlsZUVsZW1lbnRTZWxlY3RvciIsIm9wZXJhbmQiLCJBcnJheSIsImlzQXJyYXkiLCJFcnJvciIsImRpdmlzb3IiLCJyZW1haW5kZXIiLCJlbGVtZW50TWF0Y2hlcnMiLCJvcHRpb24iLCJSZWdFeHAiLCIkc2l6ZSIsImRvbnRFeHBhbmRMZWFmQXJyYXlzIiwiJHR5cGUiLCJkb250SW5jbHVkZUxlYWZBcnJheXMiLCJvcGVyYW5kQWxpYXNNYXAiLCJfZiIsIl90eXBlIiwiJGJpdHNBbGxTZXQiLCJtYXNrIiwiZ2V0T3BlcmFuZEJpdG1hc2siLCJiaXRtYXNrIiwiZ2V0VmFsdWVCaXRtYXNrIiwiYnl0ZSIsIiRiaXRzQW55U2V0IiwiJGJpdHNBbGxDbGVhciIsIiRiaXRzQW55Q2xlYXIiLCIkcmVnZXgiLCJyZWdleHAiLCIkb3B0aW9ucyIsInRlc3QiLCJzb3VyY2UiLCIkZWxlbU1hdGNoIiwiX2lzUGxhaW5PYmplY3QiLCJpc0RvY01hdGNoZXIiLCJMT0dJQ0FMX09QRVJBVE9SUyIsInJlZHVjZSIsImEiLCJiIiwic3ViTWF0Y2hlciIsImluRWxlbU1hdGNoIiwiY29tcGlsZVZhbHVlU2VsZWN0b3IiLCJhcnJheUVsZW1lbnQiLCJhcmciLCJkb250SXRlcmF0ZSIsIiRhbmQiLCJzdWJTZWxlY3RvciIsImFuZERvY3VtZW50TWF0Y2hlcnMiLCJjb21waWxlQXJyYXlPZkRvY3VtZW50U2VsZWN0b3JzIiwiJG9yIiwibWF0Y2hlcnMiLCJkb2MiLCJmbiIsIiRub3IiLCIkd2hlcmUiLCJzZWxlY3RvclZhbHVlIiwiX3JlY29yZFBhdGhVc2VkIiwiX2hhc1doZXJlIiwiRnVuY3Rpb24iLCIkY29tbWVudCIsIlZBTFVFX09QRVJBVE9SUyIsImNvbnZlcnRFbGVtZW50TWF0Y2hlclRvQnJhbmNoZWRNYXRjaGVyIiwiJG5vdCIsImludmVydEJyYW5jaGVkTWF0Y2hlciIsIiRuZSIsIiRuaW4iLCIkZXhpc3RzIiwiZXhpc3RzIiwiZXZlcnl0aGluZ01hdGNoZXIiLCIkbWF4RGlzdGFuY2UiLCIkbmVhciIsIiRhbGwiLCJicmFuY2hlZE1hdGNoZXJzIiwiY3JpdGVyaW9uIiwiYW5kQnJhbmNoZWRNYXRjaGVycyIsImlzUm9vdCIsIl9oYXNHZW9RdWVyeSIsIm1heERpc3RhbmNlIiwicG9pbnQiLCJkaXN0YW5jZSIsIiRnZW9tZXRyeSIsInR5cGUiLCJHZW9KU09OIiwicG9pbnREaXN0YW5jZSIsImNvb3JkaW5hdGVzIiwicG9pbnRUb0FycmF5IiwiZ2VvbWV0cnlXaXRoaW5SYWRpdXMiLCJkaXN0YW5jZUNvb3JkaW5hdGVQYWlycyIsImJyYW5jaGVkVmFsdWVzIiwiYnJhbmNoIiwiY3VyRGlzdGFuY2UiLCJfaXNVcGRhdGUiLCJhcnJheUluZGljZXMiLCJhbmRTb21lTWF0Y2hlcnMiLCJzdWJNYXRjaGVycyIsImRvY09yQnJhbmNoZXMiLCJtYXRjaCIsInN1YlJlc3VsdCIsInNlbGVjdG9ycyIsImRvY1NlbGVjdG9yIiwib3B0aW9ucyIsImRvY01hdGNoZXJzIiwic3Vic3RyIiwiX2lzU2ltcGxlIiwibG9va1VwQnlJbmRleCIsInZhbHVlTWF0Y2hlciIsIkJvb2xlYW4iLCJvcGVyYXRvckJyYW5jaGVkTWF0Y2hlciIsImVsZW1lbnRNYXRjaGVyIiwiYnJhbmNoZXMiLCJleHBhbmRlZCIsImVsZW1lbnQiLCJtYXRjaGVkIiwicG9pbnRBIiwicG9pbnRCIiwiTWF0aCIsImh5cG90IiwiZWxlbWVudFNlbGVjdG9yIiwiX2VxdWFsIiwiZG9jT3JCcmFuY2hlZFZhbHVlcyIsInNraXBUaGVBcnJheXMiLCJicmFuY2hlc091dCIsInRoaXNJc0FycmF5IiwicHVzaCIsIk51bWJlciIsImlzSW50ZWdlciIsIlVpbnQ4QXJyYXkiLCJJbnQzMkFycmF5IiwiYnVmZmVyIiwiaXNCaW5hcnkiLCJBcnJheUJ1ZmZlciIsIm1heCIsInZpZXciLCJpc1NhZmVJbnRlZ2VyIiwiVWludDMyQXJyYXkiLCJCWVRFU19QRVJfRUxFTUVOVCIsImluc2VydEludG9Eb2N1bWVudCIsImRvY3VtZW50IiwiZXhpc3RpbmdLZXkiLCJpbmRleE9mIiwiYnJhbmNoZWRNYXRjaGVyIiwiYnJhbmNoVmFsdWVzIiwicyIsImluY29uc2lzdGVudE9LIiwidGhlc2VBcmVPcGVyYXRvcnMiLCJzZWxLZXkiLCJ0aGlzSXNPcGVyYXRvciIsIkpTT04iLCJzdHJpbmdpZnkiLCJjbXBWYWx1ZUNvbXBhcmF0b3IiLCJvcGVyYW5kVHlwZSIsIl9jbXAiLCJwYXJ0cyIsImZpcnN0UGFydCIsImxvb2t1cFJlc3QiLCJzbGljZSIsImJ1aWxkUmVzdWx0IiwiZmlyc3RMZXZlbCIsImFwcGVuZFRvUmVzdWx0IiwibW9yZSIsImZvclNvcnQiLCJhcnJheUluZGV4IiwiTWluaW1vbmdvVGVzdCIsIk1pbmltb25nb0Vycm9yIiwibWVzc2FnZSIsImZpZWxkIiwib3BlcmF0b3JNYXRjaGVycyIsIm9wZXJhdG9yIiwic2ltcGxlUmFuZ2UiLCJzaW1wbGVFcXVhbGl0eSIsInNpbXBsZUluY2x1c2lvbiIsIm5ld0xlYWZGbiIsImNvbmZsaWN0Rm4iLCJyb290IiwicGF0aEFycmF5Iiwic3VjY2VzcyIsImxhc3RLZXkiLCJ5IiwicG9wdWxhdGVEb2N1bWVudFdpdGhLZXlWYWx1ZSIsImdldFByb3RvdHlwZU9mIiwicG9wdWxhdGVEb2N1bWVudFdpdGhPYmplY3QiLCJ1bnByZWZpeGVkS2V5cyIsInZhbGlkYXRlT2JqZWN0Iiwib2JqZWN0IiwicXVlcnkiLCJfc2VsZWN0b3JJc0lkIiwiZmllbGRzIiwiZmllbGRzS2V5cyIsInNvcnQiLCJfaWQiLCJrZXlQYXRoIiwicnVsZSIsInByb2plY3Rpb25SdWxlc1RyZWUiLCJjdXJyZW50UGF0aCIsImFub3RoZXJQYXRoIiwidG9TdHJpbmciLCJsYXN0SW5kZXgiLCJ2YWxpZGF0ZUtleUluUGF0aCIsImdldEFzeW5jTWV0aG9kTmFtZSIsIkFTWU5DX0NPTExFQ1RJT05fTUVUSE9EUyIsIkFTWU5DX0NVUlNPUl9NRVRIT0RTIiwibWV0aG9kIiwicmVwbGFjZSIsIkN1cnNvciIsImNvbnN0cnVjdG9yIiwiY29sbGVjdGlvbiIsInNvcnRlciIsIl9zZWxlY3RvcklzSWRQZXJoYXBzQXNPYmplY3QiLCJfc2VsZWN0b3JJZCIsImhhc0dlb1F1ZXJ5Iiwic2tpcCIsImxpbWl0IiwiX3Byb2plY3Rpb25GbiIsIl9jb21waWxlUHJvamVjdGlvbiIsIl90cmFuc2Zvcm0iLCJ3cmFwVHJhbnNmb3JtIiwidHJhbnNmb3JtIiwiVHJhY2tlciIsInJlYWN0aXZlIiwiY291bnQiLCJfZGVwZW5kIiwiYWRkZWQiLCJyZW1vdmVkIiwiX2dldFJhd09iamVjdHMiLCJvcmRlcmVkIiwiZmV0Y2giLCJTeW1ib2wiLCJpdGVyYXRvciIsImFkZGVkQmVmb3JlIiwiY2hhbmdlZCIsIm1vdmVkQmVmb3JlIiwiaW5kZXgiLCJvYmplY3RzIiwibmV4dCIsImRvbmUiLCJhc3luY0l0ZXJhdG9yIiwic3luY1Jlc3VsdCIsIlByb21pc2UiLCJyZXNvbHZlIiwiY2FsbGJhY2siLCJ0aGlzQXJnIiwiZ2V0VHJhbnNmb3JtIiwib2JzZXJ2ZSIsIl9vYnNlcnZlRnJvbU9ic2VydmVDaGFuZ2VzIiwib2JzZXJ2ZUNoYW5nZXMiLCJfb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3NBcmVPcmRlcmVkIiwiX2FsbG93X3Vub3JkZXJlZCIsImRpc3RhbmNlcyIsIl9JZE1hcCIsImN1cnNvciIsImRpcnR5IiwicHJvamVjdGlvbkZuIiwicmVzdWx0c1NuYXBzaG90IiwicWlkIiwibmV4dF9xaWQiLCJxdWVyaWVzIiwicmVzdWx0cyIsInBhdXNlZCIsIndyYXBDYWxsYmFjayIsInNlbGYiLCJhcmdzIiwiYXJndW1lbnRzIiwiX29ic2VydmVRdWV1ZSIsInF1ZXVlVGFzayIsImFwcGx5IiwiX3N1cHByZXNzX2luaXRpYWwiLCJoYW5kbGUiLCJPYnNlcnZlSGFuZGxlIiwic3RvcCIsImFjdGl2ZSIsIm9uSW52YWxpZGF0ZSIsImRyYWluIiwiY2hhbmdlcnMiLCJkZXBlbmRlbmN5IiwiRGVwZW5kZW5jeSIsIm5vdGlmeSIsImJpbmQiLCJkZXBlbmQiLCJfZ2V0Q29sbGVjdGlvbk5hbWUiLCJhcHBseVNraXBMaW1pdCIsInNlbGVjdGVkRG9jIiwiX2RvY3MiLCJnZXQiLCJzZXQiLCJjbGVhciIsImlkIiwibWF0Y2hSZXN1bHQiLCJnZXRDb21wYXJhdG9yIiwiX3B1Ymxpc2hDdXJzb3IiLCJzdWJzY3JpcHRpb24iLCJQYWNrYWdlIiwibW9uZ28iLCJNb25nbyIsIkNvbGxlY3Rpb24iLCJhc3luY05hbWUiLCJpc0NhbGxlZEZyb21Bc3luYyIsInJlamVjdCIsIl9vYmplY3RTcHJlYWQiLCJNZXRlb3IiLCJfU3luY2hyb25vdXNRdWV1ZSIsImNyZWF0ZSIsIl9zYXZlZE9yaWdpbmFscyIsImNvdW50RG9jdW1lbnRzIiwiY291bnRBc3luYyIsImVzdGltYXRlZERvY3VtZW50Q291bnQiLCJmaW5kT25lIiwiaW5zZXJ0IiwiYXNzZXJ0SGFzVmFsaWRGaWVsZE5hbWVzIiwiX3VzZU9JRCIsIk1vbmdvSUQiLCJPYmplY3RJRCIsIlJhbmRvbSIsImhhcyIsIl9zYXZlT3JpZ2luYWwiLCJxdWVyaWVzVG9SZWNvbXB1dGUiLCJfaW5zZXJ0SW5SZXN1bHRzIiwiX3JlY29tcHV0ZVJlc3VsdHMiLCJkZWZlciIsInBhdXNlT2JzZXJ2ZXJzIiwicmVtb3ZlIiwiZXF1YWxzIiwic2l6ZSIsIl9lYWNoUG9zc2libHlNYXRjaGluZ0RvYyIsInF1ZXJ5UmVtb3ZlIiwicmVtb3ZlSWQiLCJyZW1vdmVEb2MiLCJfcmVtb3ZlRnJvbVJlc3VsdHMiLCJyZXN1bWVPYnNlcnZlcnMiLCJfZGlmZlF1ZXJ5Q2hhbmdlcyIsInJldHJpZXZlT3JpZ2luYWxzIiwib3JpZ2luYWxzIiwic2F2ZU9yaWdpbmFscyIsInVwZGF0ZSIsInFpZFRvT3JpZ2luYWxSZXN1bHRzIiwiZG9jTWFwIiwiaWRzTWF0Y2hlZCIsIl9pZHNNYXRjaGVkQnlTZWxlY3RvciIsIm1lbW9pemVkQ2xvbmVJZk5lZWRlZCIsImRvY1RvTWVtb2l6ZSIsInJlY29tcHV0ZVFpZHMiLCJ1cGRhdGVDb3VudCIsInF1ZXJ5UmVzdWx0IiwiX21vZGlmeUFuZE5vdGlmeSIsIm11bHRpIiwiaW5zZXJ0ZWRJZCIsInVwc2VydCIsIl9jcmVhdGVVcHNlcnREb2N1bWVudCIsIl9yZXR1cm5PYmplY3QiLCJudW1iZXJBZmZlY3RlZCIsInNwZWNpZmljSWRzIiwibWF0Y2hlZF9iZWZvcmUiLCJvbGRfZG9jIiwiYWZ0ZXJNYXRjaCIsImFmdGVyIiwiYmVmb3JlIiwiX3VwZGF0ZUluUmVzdWx0cyIsIm9sZFJlc3VsdHMiLCJfQ2FjaGluZ0NoYW5nZU9ic2VydmVyIiwib3JkZXJlZEZyb21DYWxsYmFja3MiLCJjYWxsYmFja3MiLCJkb2NzIiwiT3JkZXJlZERpY3QiLCJpZFN0cmluZ2lmeSIsImFwcGx5Q2hhbmdlIiwicHV0QmVmb3JlIiwibW92ZUJlZm9yZSIsIkRpZmZTZXF1ZW5jZSIsImFwcGx5Q2hhbmdlcyIsIklkTWFwIiwiaWRQYXJzZSIsIl9fd3JhcHBlZFRyYW5zZm9ybV9fIiwid3JhcHBlZCIsInRyYW5zZm9ybWVkIiwibm9ucmVhY3RpdmUiLCJfYmluYXJ5U2VhcmNoIiwiY21wIiwiYXJyYXkiLCJmaXJzdCIsInJhbmdlIiwiaGFsZlJhbmdlIiwiZmxvb3IiLCJfY2hlY2tTdXBwb3J0ZWRQcm9qZWN0aW9uIiwiX2lkUHJvamVjdGlvbiIsInJ1bGVUcmVlIiwic3ViZG9jIiwic2VsZWN0b3JEb2N1bWVudCIsImlzTW9kaWZ5IiwiX2lzTW9kaWZpY2F0aW9uTW9kIiwibmV3RG9jIiwiaXNJbnNlcnQiLCJyZXBsYWNlbWVudCIsIl9kaWZmT2JqZWN0cyIsImxlZnQiLCJyaWdodCIsImRpZmZPYmplY3RzIiwibmV3UmVzdWx0cyIsIm9ic2VydmVyIiwiZGlmZlF1ZXJ5Q2hhbmdlcyIsIl9kaWZmUXVlcnlPcmRlcmVkQ2hhbmdlcyIsImRpZmZRdWVyeU9yZGVyZWRDaGFuZ2VzIiwiX2RpZmZRdWVyeVVub3JkZXJlZENoYW5nZXMiLCJkaWZmUXVlcnlVbm9yZGVyZWRDaGFuZ2VzIiwiX2ZpbmRJbk9yZGVyZWRSZXN1bHRzIiwic3ViSWRzIiwiX2luc2VydEluU29ydGVkTGlzdCIsInNwbGljZSIsImlzUmVwbGFjZSIsImlzTW9kaWZpZXIiLCJzZXRPbkluc2VydCIsIm1vZEZ1bmMiLCJNT0RJRklFUlMiLCJrZXlwYXRoIiwia2V5cGFydHMiLCJ0YXJnZXQiLCJmaW5kTW9kVGFyZ2V0IiwiZm9yYmlkQXJyYXkiLCJub0NyZWF0ZSIsIk5PX0NSRUFURV9NT0RJRklFUlMiLCJwb3AiLCJvYnNlcnZlQ2FsbGJhY2tzIiwic3VwcHJlc3NlZCIsIm9ic2VydmVDaGFuZ2VzQ2FsbGJhY2tzIiwiX29ic2VydmVDYWxsYmFja3NBcmVPcmRlcmVkIiwiaW5kaWNlcyIsIl9ub19pbmRpY2VzIiwiYWRkZWRBdCIsImNoYW5nZWRBdCIsIm9sZERvYyIsIm1vdmVkVG8iLCJmcm9tIiwidG8iLCJyZW1vdmVkQXQiLCJjaGFuZ2VPYnNlcnZlciIsIl9mcm9tT2JzZXJ2ZSIsIm5vbk11dGF0aW5nQ2FsbGJhY2tzIiwiY2hhbmdlZEZpZWxkcyIsIm1ha2VDaGFuZ2VkRmllbGRzIiwib2xkX2lkeCIsIm5ld19pZHgiLCIkY3VycmVudERhdGUiLCJEYXRlIiwiJGluYyIsIiRtaW4iLCIkbWF4IiwiJG11bCIsIiRyZW5hbWUiLCJ0YXJnZXQyIiwiJHNldE9uSW5zZXJ0IiwiJHB1c2giLCIkZWFjaCIsInRvUHVzaCIsInBvc2l0aW9uIiwiJHBvc2l0aW9uIiwiJHNsaWNlIiwic29ydEZ1bmN0aW9uIiwiJHNvcnQiLCJzcGxpY2VBcmd1bWVudHMiLCIkcHVzaEFsbCIsIiRhZGRUb1NldCIsImlzRWFjaCIsInZhbHVlcyIsInRvQWRkIiwiJHBvcCIsInRvUG9wIiwiJHB1bGwiLCJ0b1B1bGwiLCJvdXQiLCIkcHVsbEFsbCIsIiRiaXQiLCIkdiIsImludmFsaWRDaGFyTXNnIiwiJCIsImFzc2VydElzVmFsaWRGaWVsZE5hbWUiLCJ1c2VkQXJyYXlJbmRleCIsImxhc3QiLCJrZXlwYXJ0IiwicGFyc2VJbnQiLCJEZWNpbWFsIiwiRGVjaW1hbFN0dWIiLCJpc1VwZGF0ZSIsIl9kb2NNYXRjaGVyIiwiX2NvbXBpbGVTZWxlY3RvciIsImhhc1doZXJlIiwia2V5T3JkZXJTZW5zaXRpdmUiLCJfdHlwZW9yZGVyIiwidCIsInRhIiwidGIiLCJvYSIsIm9iIiwidG9IZXhTdHJpbmciLCJpc05hTiIsImdldFRpbWUiLCJtaW51cyIsInRvTnVtYmVyIiwidG9BcnJheSIsIkxvY2FsQ29sbGVjdGlvbl8iLCJzcGVjIiwiX3NvcnRTcGVjUGFydHMiLCJfc29ydEZ1bmN0aW9uIiwiYWRkU3BlY1BhcnQiLCJhc2NlbmRpbmciLCJjaGFyQXQiLCJsb29rdXAiLCJfa2V5Q29tcGFyYXRvciIsImNvbXBvc2VDb21wYXJhdG9ycyIsIl9rZXlGaWVsZENvbXBhcmF0b3IiLCJfZ2V0QmFzZUNvbXBhcmF0b3IiLCJfY29tcGFyZUtleXMiLCJrZXkxIiwia2V5MiIsIl9nZW5lcmF0ZUtleXNGcm9tRG9jIiwiY2IiLCJwYXRoRnJvbUluZGljZXMiLCJrbm93blBhdGhzIiwidmFsdWVzQnlJbmRleEFuZFBhdGgiLCJ1c2VkUGF0aHMiLCJzb2xlS2V5IiwiZG9jMSIsImRvYzIiLCJfZ2V0TWluS2V5RnJvbURvYyIsIm1pbktleSIsImludmVydCIsImNvbXBhcmUiLCJjb21wYXJhdG9yQXJyYXkiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQUEsTUFBTSxDQUFDQyxJQUFJLENBQUMsdUJBQXVCLENBQUM7QUFBQyxJQUFJQyxNQUFNLEVBQUNDLFlBQVksRUFBQ0MsZ0JBQWdCLEVBQUNDLFdBQVcsRUFBQ0MsaUJBQWlCO0FBQUNOLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLGFBQWEsRUFBQztFQUFDQyxN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QUFFQSxDQUFDLEdBQUc2bEIsZUFBZSxDQUFDM2xCLE1BQU0sRUFBRSxFQUFFRixDQUFDLEVBQUU7TUFDL0MsTUFBTTRsQixPQUFPLEdBQUdDLGVBQWUsQ0FBQzdsQixDQUFDLENBQUMsQ0FBQ3NILENBQUMsRUFBRUMsQ0FBQyxDQUFDO01BQ3hDLElBQUlxZSxPQUFPLEtBQUssQ0FBQyxFQUFFO1FBQ2pCLE9BQU9BLE9BQU87TUFDaEI7SUFDRjtJQUVBLE9BQU8sQ0FBQztFQUNWLENBQUM7QUFDSCxDIiwiZmlsZSI6Ii9wYWNrYWdlcy9taW5pbW9uZ28uanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgJy4vbWluaW1vbmdvX2NvbW1vbi5qcyc7XG5pbXBvcnQge1xuICBoYXNPd24sXG4gIGlzTnVtZXJpY0tleSxcbiAgaXNPcGVyYXRvck9iamVjdCxcbiAgcGF0aHNUb1RyZWUsXG4gIHByb2plY3Rpb25EZXRhaWxzLFxufSBmcm9tICcuL2NvbW1vbi5qcyc7XG5cbk1pbmltb25nby5fcGF0aHNFbGlkaW5nTnVtZXJpY0tleXMgPSBwYXRocyA9PiBwYXRocy5tYXAocGF0aCA9PlxuICBwYXRoLnNwbGl0KCcuJykuZmlsdGVyKHBhcnQgPT4gIWlzTnVtZXJpY0tleShwYXJ0KSkuam9pbignLicpXG4pO1xuXG4vLyBSZXR1cm5zIHRydWUgaWYgdGhlIG1vZGlmaWVyIGFwcGxpZWQgdG8gc29tZSBkb2N1bWVudCBtYXkgY2hhbmdlIHRoZSByZXN1bHRcbi8vIG9mIG1hdGNoaW5nIHRoZSBkb2N1bWVudCBieSBzZWxlY3RvclxuLy8gVGhlIG1vZGlmaWVyIGlzIGFsd2F5cyBpbiBhIGZvcm0gb2YgT2JqZWN0OlxuLy8gIC0gJHNldFxuLy8gICAgLSAnYS5iLjIyLnonOiB2YWx1ZVxuLy8gICAgLSAnZm9vLmJhcic6IDQyXG4vLyAgLSAkdW5zZXRcbi8vICAgIC0gJ2FiYy5kJzogMVxuTWluaW1vbmdvLk1hdGNoZXIucHJvdG90eXBlLmFmZmVjdGVkQnlNb2RpZmllciA9IGZ1bmN0aW9uKG1vZGlmaWVyKSB7XG4gIC8vIHNhZmUgY2hlY2sgZm9yICRzZXQvJHVuc2V0IGJlaW5nIG9iamVjdHNcbiAgbW9kaWZpZXIgPSBPYmplY3QuYXNzaWduKHskc2V0OiB7fSwgJHVuc2V0OiB7fX0sIG1vZGlmaWVyKTtcblxuICBjb25zdCBtZWFuaW5nZnVsUGF0aHMgPSB0aGlzLl9nZXRQYXRocygpO1xuICBjb25zdCBtb2RpZmllZFBhdGhzID0gW10uY29uY2F0KFxuICAgIE9iamVjdC5rZXlzKG1vZGlmaWVyLiRzZXQpLFxuICAgIE9iamVjdC5rZXlzKG1vZGlmaWVyLiR1bnNldClcbiAgKTtcblxuICByZXR1cm4gbW9kaWZpZWRQYXRocy5zb21lKHBhdGggPT4ge1xuICAgIGNvbnN0IG1vZCA9IHBhdGguc3BsaXQoJy4nKTtcblxuICAgIHJldHVybiBtZWFuaW5nZnVsUGF0aHMuc29tZShtZWFuaW5nZnVsUGF0aCA9PiB7XG4gICAgICBjb25zdCBzZWwgPSBtZWFuaW5nZnVsUGF0aC5zcGxpdCgnLicpO1xuXG4gICAgICBsZXQgaSA9IDAsIGogPSAwO1xuXG4gICAgICB3aGlsZSAoaSA8IHNlbC5sZW5ndGggJiYgaiA8IG1vZC5sZW5ndGgpIHtcbiAgICAgICAgaWYgKGlzTnVtZXJpY0tleShzZWxbaV0pICYmIGlzTnVtZXJpY0tleShtb2Rbal0pKSB7XG4gICAgICAgICAgLy8gZm9vLjQuYmFyIHNlbGVjdG9yIGFmZmVjdGVkIGJ5IGZvby40IG1vZGlmaWVyXG4gICAgICAgICAgLy8gZm9vLjMuYmFyIHNlbGVjdG9yIHVuYWZmZWN0ZWQgYnkgZm9vLjQgbW9kaWZpZXJcbiAgICAgICAgICBpZiAoc2VsW2ldID09PSBtb2Rbal0pIHtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgIGorKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChpc051bWVyaWNLZXkoc2VsW2ldKSkge1xuICAgICAgICAgIC8vIGZvby40LmJhciBzZWxlY3RvciB1bmFmZmVjdGVkIGJ5IGZvby5iYXIgbW9kaWZpZXJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljS2V5KG1vZFtqXSkpIHtcbiAgICAgICAgICBqKys7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VsW2ldID09PSBtb2Rbal0pIHtcbiAgICAgICAgICBpKys7XG4gICAgICAgICAgaisrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBPbmUgaXMgYSBwcmVmaXggb2YgYW5vdGhlciwgdGFraW5nIG51bWVyaWMgZmllbGRzIGludG8gYWNjb3VudFxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gQHBhcmFtIG1vZGlmaWVyIC0gT2JqZWN0OiBNb25nb0RCLXN0eWxlZCBtb2RpZmllciB3aXRoIGAkc2V0YHMgYW5kIGAkdW5zZXRzYFxuLy8gICAgICAgICAgICAgICAgICAgICAgICAgICBvbmx5LiAoYXNzdW1lZCB0byBjb21lIGZyb20gb3Bsb2cpXG4vLyBAcmV0dXJucyAtIEJvb2xlYW46IGlmIGFmdGVyIGFwcGx5aW5nIHRoZSBtb2RpZmllciwgc2VsZWN0b3IgY2FuIHN0YXJ0XG4vLyAgICAgICAgICAgICAgICAgICAgIGFjY2VwdGluZyB0aGUgbW9kaWZpZWQgdmFsdWUuXG4vLyBOT1RFOiBhc3N1bWVzIHRoYXQgZG9jdW1lbnQgYWZmZWN0ZWQgYnkgbW9kaWZpZXIgZGlkbid0IG1hdGNoIHRoaXMgTWF0Y2hlclxuLy8gYmVmb3JlLCBzbyBpZiBtb2RpZmllciBjYW4ndCBjb252aW5jZSBzZWxlY3RvciBpbiBhIHBvc2l0aXZlIGNoYW5nZSBpdCB3b3VsZFxuLy8gc3RheSAnZmFsc2UnLlxuLy8gQ3VycmVudGx5IGRvZXNuJ3Qgc3VwcG9ydCAkLW9wZXJhdG9ycyBhbmQgbnVtZXJpYyBpbmRpY2VzIHByZWNpc2VseS5cbk1pbmltb25nby5NYXRjaGVyLnByb3RvdHlwZS5jYW5CZWNvbWVUcnVlQnlNb2RpZmllciA9IGZ1bmN0aW9uKG1vZGlmaWVyKSB7XG4gIGlmICghdGhpcy5hZmZlY3RlZEJ5TW9kaWZpZXIobW9kaWZpZXIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKCF0aGlzLmlzU2ltcGxlKCkpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIG1vZGlmaWVyID0gT2JqZWN0LmFzc2lnbih7JHNldDoge30sICR1bnNldDoge319LCBtb2RpZmllcik7XG5cbiAgY29uc3QgbW9kaWZpZXJQYXRocyA9IFtdLmNvbmNhdChcbiAgICBPYmplY3Qua2V5cyhtb2RpZmllci4kc2V0KSxcbiAgICBPYmplY3Qua2V5cyhtb2RpZmllci4kdW5zZXQpXG4gICk7XG5cbiAgaWYgKHRoaXMuX2dldFBhdGhzKCkuc29tZShwYXRoSGFzTnVtZXJpY0tleXMpIHx8XG4gICAgICBtb2RpZmllclBhdGhzLnNvbWUocGF0aEhhc051bWVyaWNLZXlzKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gY2hlY2sgaWYgdGhlcmUgaXMgYSAkc2V0IG9yICR1bnNldCB0aGF0IGluZGljYXRlcyBzb21ldGhpbmcgaXMgYW5cbiAgLy8gb2JqZWN0IHJhdGhlciB0aGFuIGEgc2NhbGFyIGluIHRoZSBhY3R1YWwgb2JqZWN0IHdoZXJlIHdlIHNhdyAkLW9wZXJhdG9yXG4gIC8vIE5PVEU6IGl0IGlzIGNvcnJlY3Qgc2luY2Ugd2UgYWxsb3cgb25seSBzY2FsYXJzIGluICQtb3BlcmF0b3JzXG4gIC8vIEV4YW1wbGU6IGZvciBzZWxlY3RvciB7J2EuYic6IHskZ3Q6IDV9fSB0aGUgbW9kaWZpZXIgeydhLmIuYyc6N30gd291bGRcbiAgLy8gZGVmaW5pdGVseSBzZXQgdGhlIHJlc3VsdCB0byBmYWxzZSBhcyAnYS5iJyBhcHBlYXJzIHRvIGJlIGFuIG9iamVjdC5cbiAgY29uc3QgZXhwZWN0ZWRTY2FsYXJJc09iamVjdCA9IE9iamVjdC5rZXlzKHRoaXMuX3NlbGVjdG9yKS5zb21lKHBhdGggPT4ge1xuICAgIGlmICghaXNPcGVyYXRvck9iamVjdCh0aGlzLl9zZWxlY3RvcltwYXRoXSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gbW9kaWZpZXJQYXRocy5zb21lKG1vZGlmaWVyUGF0aCA9PlxuICAgICAgbW9kaWZpZXJQYXRoLnN0YXJ0c1dpdGgoYCR7cGF0aH0uYClcbiAgICApO1xuICB9KTtcblxuICBpZiAoZXhwZWN0ZWRTY2FsYXJJc09iamVjdCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIFNlZSBpZiB3ZSBjYW4gYXBwbHkgdGhlIG1vZGlmaWVyIG9uIHRoZSBpZGVhbGx5IG1hdGNoaW5nIG9iamVjdC4gSWYgaXRcbiAgLy8gc3RpbGwgbWF0Y2hlcyB0aGUgc2VsZWN0b3IsIHRoZW4gdGhlIG1vZGlmaWVyIGNvdWxkIGhhdmUgdHVybmVkIHRoZSByZWFsXG4gIC8vIG9iamVjdCBpbiB0aGUgZGF0YWJhc2UgaW50byBzb21ldGhpbmcgbWF0Y2hpbmcuXG4gIGNvbnN0IG1hdGNoaW5nRG9jdW1lbnQgPSBFSlNPTi5jbG9uZSh0aGlzLm1hdGNoaW5nRG9jdW1lbnQoKSk7XG5cbiAgLy8gVGhlIHNlbGVjdG9yIGlzIHRvbyBjb21wbGV4LCBhbnl0aGluZyBjYW4gaGFwcGVuLlxuICBpZiAobWF0Y2hpbmdEb2N1bWVudCA9PT0gbnVsbCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBMb2NhbENvbGxlY3Rpb24uX21vZGlmeShtYXRjaGluZ0RvY3VtZW50LCBtb2RpZmllcik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gQ291bGRuJ3Qgc2V0IGEgcHJvcGVydHkgb24gYSBmaWVsZCB3aGljaCBpcyBhIHNjYWxhciBvciBudWxsIGluIHRoZVxuICAgIC8vIHNlbGVjdG9yLlxuICAgIC8vIEV4YW1wbGU6XG4gICAgLy8gcmVhbCBkb2N1bWVudDogeyAnYS5iJzogMyB9XG4gICAgLy8gc2VsZWN0b3I6IHsgJ2EnOiAxMiB9XG4gICAgLy8gY29udmVydGVkIHNlbGVjdG9yIChpZGVhbCBkb2N1bWVudCk6IHsgJ2EnOiAxMiB9XG4gICAgLy8gbW9kaWZpZXI6IHsgJHNldDogeyAnYS5iJzogNCB9IH1cbiAgICAvLyBXZSBkb24ndCBrbm93IHdoYXQgcmVhbCBkb2N1bWVudCB3YXMgbGlrZSBidXQgZnJvbSB0aGUgZXJyb3IgcmFpc2VkIGJ5XG4gICAgLy8gJHNldCBvbiBhIHNjYWxhciBmaWVsZCB3ZSBjYW4gcmVhc29uIHRoYXQgdGhlIHN0cnVjdHVyZSBvZiByZWFsIGRvY3VtZW50XG4gICAgLy8gaXMgY29tcGxldGVseSBkaWZmZXJlbnQuXG4gICAgaWYgKGVycm9yLm5hbWUgPT09ICdNaW5pbW9uZ29FcnJvcicgJiYgZXJyb3Iuc2V0UHJvcGVydHlFcnJvcikge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuZG9jdW1lbnRNYXRjaGVzKG1hdGNoaW5nRG9jdW1lbnQpLnJlc3VsdDtcbn07XG5cbi8vIEtub3dzIGhvdyB0byBjb21iaW5lIGEgbW9uZ28gc2VsZWN0b3IgYW5kIGEgZmllbGRzIHByb2plY3Rpb24gdG8gYSBuZXcgZmllbGRzXG4vLyBwcm9qZWN0aW9uIHRha2luZyBpbnRvIGFjY291bnQgYWN0aXZlIGZpZWxkcyBmcm9tIHRoZSBwYXNzZWQgc2VsZWN0b3IuXG4vLyBAcmV0dXJucyBPYmplY3QgLSBwcm9qZWN0aW9uIG9iamVjdCAoc2FtZSBhcyBmaWVsZHMgb3B0aW9uIG9mIG1vbmdvIGN1cnNvcilcbk1pbmltb25nby5NYXRjaGVyLnByb3RvdHlwZS5jb21iaW5lSW50b1Byb2plY3Rpb24gPSBmdW5jdGlvbihwcm9qZWN0aW9uKSB7XG4gIGNvbnN0IHNlbGVjdG9yUGF0aHMgPSBNaW5pbW9uZ28uX3BhdGhzRWxpZGluZ051bWVyaWNLZXlzKHRoaXMuX2dldFBhdGhzKCkpO1xuXG4gIC8vIFNwZWNpYWwgY2FzZSBmb3IgJHdoZXJlIG9wZXJhdG9yIGluIHRoZSBzZWxlY3RvciAtIHByb2plY3Rpb24gc2hvdWxkIGRlcGVuZFxuICAvLyBvbiBhbGwgZmllbGRzIG9mIHRoZSBkb2N1bWVudC4gZ2V0U2VsZWN0b3JQYXRocyByZXR1cm5zIGEgbGlzdCBvZiBwYXRoc1xuICAvLyBzZWxlY3RvciBkZXBlbmRzIG9uLiBJZiBvbmUgb2YgdGhlIHBhdGhzIGlzICcnIChlbXB0eSBzdHJpbmcpIHJlcHJlc2VudGluZ1xuICAvLyB0aGUgcm9vdCBvciB0aGUgd2hvbGUgZG9jdW1lbnQsIGNvbXBsZXRlIHByb2plY3Rpb24gc2hvdWxkIGJlIHJldHVybmVkLlxuICBpZiAoc2VsZWN0b3JQYXRocy5pbmNsdWRlcygnJykpIHtcbiAgICByZXR1cm4ge307XG4gIH1cblxuICByZXR1cm4gY29tYmluZUltcG9ydGFudFBhdGhzSW50b1Byb2plY3Rpb24oc2VsZWN0b3JQYXRocywgcHJvamVjdGlvbik7XG59O1xuXG4vLyBSZXR1cm5zIGFuIG9iamVjdCB0aGF0IHdvdWxkIG1hdGNoIHRoZSBzZWxlY3RvciBpZiBwb3NzaWJsZSBvciBudWxsIGlmIHRoZVxuLy8gc2VsZWN0b3IgaXMgdG9vIGNvbXBsZXggZm9yIHVzIHRvIGFuYWx5emVcbi8vIHsgJ2EuYic6IHsgYW5zOiA0MiB9LCAnZm9vLmJhcic6IG51bGwsICdmb28uYmF6JzogXCJzb21ldGhpbmdcIiB9XG4vLyA9PiB7IGE6IHsgYjogeyBhbnM6IDQyIH0gfSwgZm9vOiB7IGJhcjogbnVsbCwgYmF6OiBcInNvbWV0aGluZ1wiIH0gfVxuTWluaW1vbmdvLk1hdGNoZXIucHJvdG90eXBlLm1hdGNoaW5nRG9jdW1lbnQgPSBmdW5jdGlvbigpIHtcbiAgLy8gY2hlY2sgaWYgaXQgd2FzIGNvbXB1dGVkIGJlZm9yZVxuICBpZiAodGhpcy5fbWF0Y2hpbmdEb2N1bWVudCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIHRoaXMuX21hdGNoaW5nRG9jdW1lbnQ7XG4gIH1cblxuICAvLyBJZiB0aGUgYW5hbHlzaXMgb2YgdGhpcyBzZWxlY3RvciBpcyB0b28gaGFyZCBmb3Igb3VyIGltcGxlbWVudGF0aW9uXG4gIC8vIGZhbGxiYWNrIHRvIFwiWUVTXCJcbiAgbGV0IGZhbGxiYWNrID0gZmFsc2U7XG5cbiAgdGhpcy5fbWF0Y2hpbmdEb2N1bWVudCA9IHBhdGhzVG9UcmVlKFxuICAgIHRoaXMuX2dldFBhdGhzKCksXG4gICAgcGF0aCA9PiB7XG4gICAgICBjb25zdCB2YWx1ZVNlbGVjdG9yID0gdGhpcy5fc2VsZWN0b3JbcGF0aF07XG5cbiAgICAgIGlmIChpc09wZXJhdG9yT2JqZWN0KHZhbHVlU2VsZWN0b3IpKSB7XG4gICAgICAgIC8vIGlmIHRoZXJlIGlzIGEgc3RyaWN0IGVxdWFsaXR5LCB0aGVyZSBpcyBhIGdvb2RcbiAgICAgICAgLy8gY2hhbmNlIHdlIGNhbiB1c2Ugb25lIG9mIHRob3NlIGFzIFwibWF0Y2hpbmdcIlxuICAgICAgICAvLyBkdW1teSB2YWx1ZVxuICAgICAgICBpZiAodmFsdWVTZWxlY3Rvci4kZXEpIHtcbiAgICAgICAgICByZXR1cm4gdmFsdWVTZWxlY3Rvci4kZXE7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsdWVTZWxlY3Rvci4kaW4pIHtcbiAgICAgICAgICBjb25zdCBtYXRjaGVyID0gbmV3IE1pbmltb25nby5NYXRjaGVyKHtwbGFjZWhvbGRlcjogdmFsdWVTZWxlY3Rvcn0pO1xuXG4gICAgICAgICAgLy8gUmV0dXJuIGFueXRoaW5nIGZyb20gJGluIHRoYXQgbWF0Y2hlcyB0aGUgd2hvbGUgc2VsZWN0b3IgZm9yIHRoaXNcbiAgICAgICAgICAvLyBwYXRoLiBJZiBub3RoaW5nIG1hdGNoZXMsIHJldHVybnMgYHVuZGVmaW5lZGAgYXMgbm90aGluZyBjYW4gbWFrZVxuICAgICAgICAgIC8vIHRoaXMgc2VsZWN0b3IgaW50byBgdHJ1ZWAuXG4gICAgICAgICAgcmV0dXJuIHZhbHVlU2VsZWN0b3IuJGluLmZpbmQocGxhY2Vob2xkZXIgPT5cbiAgICAgICAgICAgIG1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKHtwbGFjZWhvbGRlcn0pLnJlc3VsdFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob25seUNvbnRhaW5zS2V5cyh2YWx1ZVNlbGVjdG9yLCBbJyRndCcsICckZ3RlJywgJyRsdCcsICckbHRlJ10pKSB7XG4gICAgICAgICAgbGV0IGxvd2VyQm91bmQgPSAtSW5maW5pdHk7XG4gICAgICAgICAgbGV0IHVwcGVyQm91bmQgPSBJbmZpbml0eTtcblxuICAgICAgICAgIFsnJGx0ZScsICckbHQnXS5mb3JFYWNoKG9wID0+IHtcbiAgICAgICAgICAgIGlmIChoYXNPd24uY2FsbCh2YWx1ZVNlbGVjdG9yLCBvcCkgJiZcbiAgICAgICAgICAgICAgICB2YWx1ZVNlbGVjdG9yW29wXSA8IHVwcGVyQm91bmQpIHtcbiAgICAgICAgICAgICAgdXBwZXJCb3VuZCA9IHZhbHVlU2VsZWN0b3Jbb3BdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgWyckZ3RlJywgJyRndCddLmZvckVhY2gob3AgPT4ge1xuICAgICAgICAgICAgaWYgKGhhc093bi5jYWxsKHZhbHVlU2VsZWN0b3IsIG9wKSAmJlxuICAgICAgICAgICAgICAgIHZhbHVlU2VsZWN0b3Jbb3BdID4gbG93ZXJCb3VuZCkge1xuICAgICAgICAgICAgICBsb3dlckJvdW5kID0gdmFsdWVTZWxlY3RvcltvcF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBjb25zdCBtaWRkbGUgPSAobG93ZXJCb3VuZCArIHVwcGVyQm91bmQpIC8gMjtcbiAgICAgICAgICBjb25zdCBtYXRjaGVyID0gbmV3IE1pbmltb25nby5NYXRjaGVyKHtwbGFjZWhvbGRlcjogdmFsdWVTZWxlY3Rvcn0pO1xuXG4gICAgICAgICAgaWYgKCFtYXRjaGVyLmRvY3VtZW50TWF0Y2hlcyh7cGxhY2Vob2xkZXI6IG1pZGRsZX0pLnJlc3VsdCAmJlxuICAgICAgICAgICAgICAobWlkZGxlID09PSBsb3dlckJvdW5kIHx8IG1pZGRsZSA9PT0gdXBwZXJCb3VuZCkpIHtcbiAgICAgICAgICAgIGZhbGxiYWNrID0gdHJ1ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gbWlkZGxlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9ubHlDb250YWluc0tleXModmFsdWVTZWxlY3RvciwgWyckbmluJywgJyRuZSddKSkge1xuICAgICAgICAgIC8vIFNpbmNlIHRoaXMuX2lzU2ltcGxlIG1ha2VzIHN1cmUgJG5pbiBhbmQgJG5lIGFyZSBub3QgY29tYmluZWQgd2l0aFxuICAgICAgICAgIC8vIG9iamVjdHMgb3IgYXJyYXlzLCB3ZSBjYW4gY29uZmlkZW50bHkgcmV0dXJuIGFuIGVtcHR5IG9iamVjdCBhcyBpdFxuICAgICAgICAgIC8vIG5ldmVyIG1hdGNoZXMgYW55IHNjYWxhci5cbiAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH1cblxuICAgICAgICBmYWxsYmFjayA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl9zZWxlY3RvcltwYXRoXTtcbiAgICB9LFxuICAgIHggPT4geCk7XG5cbiAgaWYgKGZhbGxiYWNrKSB7XG4gICAgdGhpcy5fbWF0Y2hpbmdEb2N1bWVudCA9IG51bGw7XG4gIH1cblxuICByZXR1cm4gdGhpcy5fbWF0Y2hpbmdEb2N1bWVudDtcbn07XG5cbi8vIE1pbmltb25nby5Tb3J0ZXIgZ2V0cyBhIHNpbWlsYXIgbWV0aG9kLCB3aGljaCBkZWxlZ2F0ZXMgdG8gYSBNYXRjaGVyIGl0IG1hZGVcbi8vIGZvciB0aGlzIGV4YWN0IHB1cnBvc2UuXG5NaW5pbW9uZ28uU29ydGVyLnByb3RvdHlwZS5hZmZlY3RlZEJ5TW9kaWZpZXIgPSBmdW5jdGlvbihtb2RpZmllcikge1xuICByZXR1cm4gdGhpcy5fc2VsZWN0b3JGb3JBZmZlY3RlZEJ5TW9kaWZpZXIuYWZmZWN0ZWRCeU1vZGlmaWVyKG1vZGlmaWVyKTtcbn07XG5cbk1pbmltb25nby5Tb3J0ZXIucHJvdG90eXBlLmNvbWJpbmVJbnRvUHJvamVjdGlvbiA9IGZ1bmN0aW9uKHByb2plY3Rpb24pIHtcbiAgcmV0dXJuIGNvbWJpbmVJbXBvcnRhbnRQYXRoc0ludG9Qcm9qZWN0aW9uKFxuICAgIE1pbmltb25nby5fcGF0aHNFbGlkaW5nTnVtZXJpY0tleXModGhpcy5fZ2V0UGF0aHMoKSksXG4gICAgcHJvamVjdGlvblxuICApO1xufTtcblxuZnVuY3Rpb24gY29tYmluZUltcG9ydGFudFBhdGhzSW50b1Byb2plY3Rpb24ocGF0aHMsIHByb2plY3Rpb24pIHtcbiAgY29uc3QgZGV0YWlscyA9IHByb2plY3Rpb25EZXRhaWxzKHByb2plY3Rpb24pO1xuXG4gIC8vIG1lcmdlIHRoZSBwYXRocyB0byBpbmNsdWRlXG4gIGNvbnN0IHRyZWUgPSBwYXRoc1RvVHJlZShcbiAgICBwYXRocyxcbiAgICBwYXRoID0+IHRydWUsXG4gICAgKG5vZGUsIHBhdGgsIGZ1bGxQYXRoKSA9PiB0cnVlLFxuICAgIGRldGFpbHMudHJlZVxuICApO1xuICBjb25zdCBtZXJnZWRQcm9qZWN0aW9uID0gdHJlZVRvUGF0aHModHJlZSk7XG5cbiAgaWYgKGRldGFpbHMuaW5jbHVkaW5nKSB7XG4gICAgLy8gYm90aCBzZWxlY3RvciBhbmQgcHJvamVjdGlvbiBhcmUgcG9pbnRpbmcgb24gZmllbGRzIHRvIGluY2x1ZGVcbiAgICAvLyBzbyB3ZSBjYW4ganVzdCByZXR1cm4gdGhlIG1lcmdlZCB0cmVlXG4gICAgcmV0dXJuIG1lcmdlZFByb2plY3Rpb247XG4gIH1cblxuICAvLyBzZWxlY3RvciBpcyBwb2ludGluZyBhdCBmaWVsZHMgdG8gaW5jbHVkZVxuICAvLyBwcm9qZWN0aW9uIGlzIHBvaW50aW5nIGF0IGZpZWxkcyB0byBleGNsdWRlXG4gIC8vIG1ha2Ugc3VyZSB3ZSBkb24ndCBleGNsdWRlIGltcG9ydGFudCBwYXRoc1xuICBjb25zdCBtZXJnZWRFeGNsUHJvamVjdGlvbiA9IHt9O1xuXG4gIE9iamVjdC5rZXlzKG1lcmdlZFByb2plY3Rpb24pLmZvckVhY2gocGF0aCA9PiB7XG4gICAgaWYgKCFtZXJnZWRQcm9qZWN0aW9uW3BhdGhdKSB7XG4gICAgICBtZXJnZWRFeGNsUHJvamVjdGlvbltwYXRoXSA9IGZhbHNlO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIG1lcmdlZEV4Y2xQcm9qZWN0aW9uO1xufVxuXG5mdW5jdGlvbiBnZXRQYXRocyhzZWxlY3Rvcikge1xuICByZXR1cm4gT2JqZWN0LmtleXMobmV3IE1pbmltb25nby5NYXRjaGVyKHNlbGVjdG9yKS5fcGF0aHMpO1xuXG4gIC8vIFhYWCByZW1vdmUgaXQ/XG4gIC8vIHJldHVybiBPYmplY3Qua2V5cyhzZWxlY3RvcikubWFwKGsgPT4ge1xuICAvLyAgIC8vIHdlIGRvbid0IGtub3cgaG93IHRvIGhhbmRsZSAkd2hlcmUgYmVjYXVzZSBpdCBjYW4gYmUgYW55dGhpbmdcbiAgLy8gICBpZiAoayA9PT0gJyR3aGVyZScpIHtcbiAgLy8gICAgIHJldHVybiAnJzsgLy8gbWF0Y2hlcyBldmVyeXRoaW5nXG4gIC8vICAgfVxuXG4gIC8vICAgLy8gd2UgYnJhbmNoIGZyb20gJG9yLyRhbmQvJG5vciBvcGVyYXRvclxuICAvLyAgIGlmIChbJyRvcicsICckYW5kJywgJyRub3InXS5pbmNsdWRlcyhrKSkge1xuICAvLyAgICAgcmV0dXJuIHNlbGVjdG9yW2tdLm1hcChnZXRQYXRocyk7XG4gIC8vICAgfVxuXG4gIC8vICAgLy8gdGhlIHZhbHVlIGlzIGEgbGl0ZXJhbCBvciBzb21lIGNvbXBhcmlzb24gb3BlcmF0b3JcbiAgLy8gICByZXR1cm4gaztcbiAgLy8gfSlcbiAgLy8gICAucmVkdWNlKChhLCBiKSA9PiBhLmNvbmNhdChiKSwgW10pXG4gIC8vICAgLmZpbHRlcigoYSwgYiwgYykgPT4gYy5pbmRleE9mKGEpID09PSBiKTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZW5zdXJlIG9iamVjdCBoYXMgb25seSBjZXJ0YWluIGtleXNcbmZ1bmN0aW9uIG9ubHlDb250YWluc0tleXMob2JqLCBrZXlzKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLmV2ZXJ5KGsgPT4ga2V5cy5pbmNsdWRlcyhrKSk7XG59XG5cbmZ1bmN0aW9uIHBhdGhIYXNOdW1lcmljS2V5cyhwYXRoKSB7XG4gIHJldHVybiBwYXRoLnNwbGl0KCcuJykuc29tZShpc051bWVyaWNLZXkpO1xufVxuXG4vLyBSZXR1cm5zIGEgc2V0IG9mIGtleSBwYXRocyBzaW1pbGFyIHRvXG4vLyB7ICdmb28uYmFyJzogMSwgJ2EuYi5jJzogMSB9XG5mdW5jdGlvbiB0cmVlVG9QYXRocyh0cmVlLCBwcmVmaXggPSAnJykge1xuICBjb25zdCByZXN1bHQgPSB7fTtcblxuICBPYmplY3Qua2V5cyh0cmVlKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSB0cmVlW2tleV07XG4gICAgaWYgKHZhbHVlID09PSBPYmplY3QodmFsdWUpKSB7XG4gICAgICBPYmplY3QuYXNzaWduKHJlc3VsdCwgdHJlZVRvUGF0aHModmFsdWUsIGAke3ByZWZpeCArIGtleX0uYCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHRbcHJlZml4ICsga2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn1cbiIsImltcG9ydCBMb2NhbENvbGxlY3Rpb24gZnJvbSAnLi9sb2NhbF9jb2xsZWN0aW9uLmpzJztcblxuZXhwb3J0IGNvbnN0IGhhc093biA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbi8vIEVhY2ggZWxlbWVudCBzZWxlY3RvciBjb250YWluczpcbi8vICAtIGNvbXBpbGVFbGVtZW50U2VsZWN0b3IsIGEgZnVuY3Rpb24gd2l0aCBhcmdzOlxuLy8gICAgLSBvcGVyYW5kIC0gdGhlIFwicmlnaHQgaGFuZCBzaWRlXCIgb2YgdGhlIG9wZXJhdG9yXG4vLyAgICAtIHZhbHVlU2VsZWN0b3IgLSB0aGUgXCJjb250ZXh0XCIgZm9yIHRoZSBvcGVyYXRvciAoc28gdGhhdCAkcmVnZXggY2FuIGZpbmRcbi8vICAgICAgJG9wdGlvbnMpXG4vLyAgICAtIG1hdGNoZXIgLSB0aGUgTWF0Y2hlciB0aGlzIGlzIGdvaW5nIGludG8gKHNvIHRoYXQgJGVsZW1NYXRjaCBjYW4gY29tcGlsZVxuLy8gICAgICBtb3JlIHRoaW5ncylcbi8vICAgIHJldHVybmluZyBhIGZ1bmN0aW9uIG1hcHBpbmcgYSBzaW5nbGUgdmFsdWUgdG8gYm9vbC5cbi8vICAtIGRvbnRFeHBhbmRMZWFmQXJyYXlzLCBhIGJvb2wgd2hpY2ggcHJldmVudHMgZXhwYW5kQXJyYXlzSW5CcmFuY2hlcyBmcm9tXG4vLyAgICBiZWluZyBjYWxsZWRcbi8vICAtIGRvbnRJbmNsdWRlTGVhZkFycmF5cywgYSBib29sIHdoaWNoIGNhdXNlcyBhbiBhcmd1bWVudCB0byBiZSBwYXNzZWQgdG9cbi8vICAgIGV4cGFuZEFycmF5c0luQnJhbmNoZXMgaWYgaXQgaXMgY2FsbGVkXG5leHBvcnQgY29uc3QgRUxFTUVOVF9PUEVSQVRPUlMgPSB7XG4gICRsdDogbWFrZUluZXF1YWxpdHkoY21wVmFsdWUgPT4gY21wVmFsdWUgPCAwKSxcbiAgJGd0OiBtYWtlSW5lcXVhbGl0eShjbXBWYWx1ZSA9PiBjbXBWYWx1ZSA+IDApLFxuICAkbHRlOiBtYWtlSW5lcXVhbGl0eShjbXBWYWx1ZSA9PiBjbXBWYWx1ZSA8PSAwKSxcbiAgJGd0ZTogbWFrZUluZXF1YWxpdHkoY21wVmFsdWUgPT4gY21wVmFsdWUgPj0gMCksXG4gICRtb2Q6IHtcbiAgICBjb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQpIHtcbiAgICAgIGlmICghKEFycmF5LmlzQXJyYXkob3BlcmFuZCkgJiYgb3BlcmFuZC5sZW5ndGggPT09IDJcbiAgICAgICAgICAgICYmIHR5cGVvZiBvcGVyYW5kWzBdID09PSAnbnVtYmVyJ1xuICAgICAgICAgICAgJiYgdHlwZW9mIG9wZXJhbmRbMV0gPT09ICdudW1iZXInKSkge1xuICAgICAgICB0aHJvdyBFcnJvcignYXJndW1lbnQgdG8gJG1vZCBtdXN0IGJlIGFuIGFycmF5IG9mIHR3byBudW1iZXJzJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFhYWCBjb3VsZCByZXF1aXJlIHRvIGJlIGludHMgb3Igcm91bmQgb3Igc29tZXRoaW5nXG4gICAgICBjb25zdCBkaXZpc29yID0gb3BlcmFuZFswXTtcbiAgICAgIGNvbnN0IHJlbWFpbmRlciA9IG9wZXJhbmRbMV07XG4gICAgICByZXR1cm4gdmFsdWUgPT4gKFxuICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIHZhbHVlICUgZGl2aXNvciA9PT0gcmVtYWluZGVyXG4gICAgICApO1xuICAgIH0sXG4gIH0sXG4gICRpbjoge1xuICAgIGNvbXBpbGVFbGVtZW50U2VsZWN0b3Iob3BlcmFuZCkge1xuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9wZXJhbmQpKSB7XG4gICAgICAgIHRocm93IEVycm9yKCckaW4gbmVlZHMgYW4gYXJyYXknKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZWxlbWVudE1hdGNoZXJzID0gb3BlcmFuZC5tYXAob3B0aW9uID0+IHtcbiAgICAgICAgaWYgKG9wdGlvbiBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAgIHJldHVybiByZWdleHBFbGVtZW50TWF0Y2hlcihvcHRpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzT3BlcmF0b3JPYmplY3Qob3B0aW9uKSkge1xuICAgICAgICAgIHRocm93IEVycm9yKCdjYW5ub3QgbmVzdCAkIHVuZGVyICRpbicpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVxdWFsaXR5RWxlbWVudE1hdGNoZXIob3B0aW9uKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gdmFsdWUgPT4ge1xuICAgICAgICAvLyBBbGxvdyB7YTogeyRpbjogW251bGxdfX0gdG8gbWF0Y2ggd2hlbiAnYScgZG9lcyBub3QgZXhpc3QuXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnRNYXRjaGVycy5zb21lKG1hdGNoZXIgPT4gbWF0Y2hlcih2YWx1ZSkpO1xuICAgICAgfTtcbiAgICB9LFxuICB9LFxuICAkc2l6ZToge1xuICAgIC8vIHthOiBbWzUsIDVdXX0gbXVzdCBtYXRjaCB7YTogeyRzaXplOiAxfX0gYnV0IG5vdCB7YTogeyRzaXplOiAyfX0sIHNvIHdlXG4gICAgLy8gZG9uJ3Qgd2FudCB0byBjb25zaWRlciB0aGUgZWxlbWVudCBbNSw1XSBpbiB0aGUgbGVhZiBhcnJheSBbWzUsNV1dIGFzIGFcbiAgICAvLyBwb3NzaWJsZSB2YWx1ZS5cbiAgICBkb250RXhwYW5kTGVhZkFycmF5czogdHJ1ZSxcbiAgICBjb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQpIHtcbiAgICAgIGlmICh0eXBlb2Ygb3BlcmFuZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gRG9uJ3QgYXNrIG1lIHdoeSwgYnV0IGJ5IGV4cGVyaW1lbnRhdGlvbiwgdGhpcyBzZWVtcyB0byBiZSB3aGF0IE1vbmdvXG4gICAgICAgIC8vIGRvZXMuXG4gICAgICAgIG9wZXJhbmQgPSAwO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3BlcmFuZCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJyRzaXplIG5lZWRzIGEgbnVtYmVyJyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB2YWx1ZSA9PiBBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IG9wZXJhbmQ7XG4gICAgfSxcbiAgfSxcbiAgJHR5cGU6IHtcbiAgICAvLyB7YTogWzVdfSBtdXN0IG5vdCBtYXRjaCB7YTogeyR0eXBlOiA0fX0gKDQgbWVhbnMgYXJyYXkpLCBidXQgaXQgc2hvdWxkXG4gICAgLy8gbWF0Y2gge2E6IHskdHlwZTogMX19ICgxIG1lYW5zIG51bWJlciksIGFuZCB7YTogW1s1XV19IG11c3QgbWF0Y2ggeyRhOlxuICAgIC8vIHskdHlwZTogNH19LiBUaHVzLCB3aGVuIHdlIHNlZSBhIGxlYWYgYXJyYXksIHdlICpzaG91bGQqIGV4cGFuZCBpdCBidXRcbiAgICAvLyBzaG91bGQgKm5vdCogaW5jbHVkZSBpdCBpdHNlbGYuXG4gICAgZG9udEluY2x1ZGVMZWFmQXJyYXlzOiB0cnVlLFxuICAgIGNvbXBpbGVFbGVtZW50U2VsZWN0b3Iob3BlcmFuZCkge1xuICAgICAgaWYgKHR5cGVvZiBvcGVyYW5kID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCBvcGVyYW5kQWxpYXNNYXAgPSB7XG4gICAgICAgICAgJ2RvdWJsZSc6IDEsXG4gICAgICAgICAgJ3N0cmluZyc6IDIsXG4gICAgICAgICAgJ29iamVjdCc6IDMsXG4gICAgICAgICAgJ2FycmF5JzogNCxcbiAgICAgICAgICAnYmluRGF0YSc6IDUsXG4gICAgICAgICAgJ3VuZGVmaW5lZCc6IDYsXG4gICAgICAgICAgJ29iamVjdElkJzogNyxcbiAgICAgICAgICAnYm9vbCc6IDgsXG4gICAgICAgICAgJ2RhdGUnOiA5LFxuICAgICAgICAgICdudWxsJzogMTAsXG4gICAgICAgICAgJ3JlZ2V4JzogMTEsXG4gICAgICAgICAgJ2RiUG9pbnRlcic6IDEyLFxuICAgICAgICAgICdqYXZhc2NyaXB0JzogMTMsXG4gICAgICAgICAgJ3N5bWJvbCc6IDE0LFxuICAgICAgICAgICdqYXZhc2NyaXB0V2l0aFNjb3BlJzogMTUsXG4gICAgICAgICAgJ2ludCc6IDE2LFxuICAgICAgICAgICd0aW1lc3RhbXAnOiAxNyxcbiAgICAgICAgICAnbG9uZyc6IDE4LFxuICAgICAgICAgICdkZWNpbWFsJzogMTksXG4gICAgICAgICAgJ21pbktleSc6IC0xLFxuICAgICAgICAgICdtYXhLZXknOiAxMjcsXG4gICAgICAgIH07XG4gICAgICAgIGlmICghaGFzT3duLmNhbGwob3BlcmFuZEFsaWFzTWFwLCBvcGVyYW5kKSkge1xuICAgICAgICAgIHRocm93IEVycm9yKGB1bmtub3duIHN0cmluZyBhbGlhcyBmb3IgJHR5cGU6ICR7b3BlcmFuZH1gKTtcbiAgICAgICAgfVxuICAgICAgICBvcGVyYW5kID0gb3BlcmFuZEFsaWFzTWFwW29wZXJhbmRdO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3BlcmFuZCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKG9wZXJhbmQgPT09IDAgfHwgb3BlcmFuZCA8IC0xXG4gICAgICAgICAgfHwgKG9wZXJhbmQgPiAxOSAmJiBvcGVyYW5kICE9PSAxMjcpKSB7XG4gICAgICAgICAgdGhyb3cgRXJyb3IoYEludmFsaWQgbnVtZXJpY2FsICR0eXBlIGNvZGU6ICR7b3BlcmFuZH1gKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJ2FyZ3VtZW50IHRvICR0eXBlIGlzIG5vdCBhIG51bWJlciBvciBhIHN0cmluZycpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdmFsdWUgPT4gKFxuICAgICAgICB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIExvY2FsQ29sbGVjdGlvbi5fZi5fdHlwZSh2YWx1ZSkgPT09IG9wZXJhbmRcbiAgICAgICk7XG4gICAgfSxcbiAgfSxcbiAgJGJpdHNBbGxTZXQ6IHtcbiAgICBjb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQpIHtcbiAgICAgIGNvbnN0IG1hc2sgPSBnZXRPcGVyYW5kQml0bWFzayhvcGVyYW5kLCAnJGJpdHNBbGxTZXQnKTtcbiAgICAgIHJldHVybiB2YWx1ZSA9PiB7XG4gICAgICAgIGNvbnN0IGJpdG1hc2sgPSBnZXRWYWx1ZUJpdG1hc2sodmFsdWUsIG1hc2subGVuZ3RoKTtcbiAgICAgICAgcmV0dXJuIGJpdG1hc2sgJiYgbWFzay5ldmVyeSgoYnl0ZSwgaSkgPT4gKGJpdG1hc2tbaV0gJiBieXRlKSA9PT0gYnl0ZSk7XG4gICAgICB9O1xuICAgIH0sXG4gIH0sXG4gICRiaXRzQW55U2V0OiB7XG4gICAgY29tcGlsZUVsZW1lbnRTZWxlY3RvcihvcGVyYW5kKSB7XG4gICAgICBjb25zdCBtYXNrID0gZ2V0T3BlcmFuZEJpdG1hc2sob3BlcmFuZCwgJyRiaXRzQW55U2V0Jyk7XG4gICAgICByZXR1cm4gdmFsdWUgPT4ge1xuICAgICAgICBjb25zdCBiaXRtYXNrID0gZ2V0VmFsdWVCaXRtYXNrKHZhbHVlLCBtYXNrLmxlbmd0aCk7XG4gICAgICAgIHJldHVybiBiaXRtYXNrICYmIG1hc2suc29tZSgoYnl0ZSwgaSkgPT4gKH5iaXRtYXNrW2ldICYgYnl0ZSkgIT09IGJ5dGUpO1xuICAgICAgfTtcbiAgICB9LFxuICB9LFxuICAkYml0c0FsbENsZWFyOiB7XG4gICAgY29tcGlsZUVsZW1lbnRTZWxlY3RvcihvcGVyYW5kKSB7XG4gICAgICBjb25zdCBtYXNrID0gZ2V0T3BlcmFuZEJpdG1hc2sob3BlcmFuZCwgJyRiaXRzQWxsQ2xlYXInKTtcbiAgICAgIHJldHVybiB2YWx1ZSA9PiB7XG4gICAgICAgIGNvbnN0IGJpdG1hc2sgPSBnZXRWYWx1ZUJpdG1hc2sodmFsdWUsIG1hc2subGVuZ3RoKTtcbiAgICAgICAgcmV0dXJuIGJpdG1hc2sgJiYgbWFzay5ldmVyeSgoYnl0ZSwgaSkgPT4gIShiaXRtYXNrW2ldICYgYnl0ZSkpO1xuICAgICAgfTtcbiAgICB9LFxuICB9LFxuICAkYml0c0FueUNsZWFyOiB7XG4gICAgY29tcGlsZUVsZW1lbnRTZWxlY3RvcihvcGVyYW5kKSB7XG4gICAgICBjb25zdCBtYXNrID0gZ2V0T3BlcmFuZEJpdG1hc2sob3BlcmFuZCwgJyRiaXRzQW55Q2xlYXInKTtcbiAgICAgIHJldHVybiB2YWx1ZSA9PiB7XG4gICAgICAgIGNvbnN0IGJpdG1hc2sgPSBnZXRWYWx1ZUJpdG1hc2sodmFsdWUsIG1hc2subGVuZ3RoKTtcbiAgICAgICAgcmV0dXJuIGJpdG1hc2sgJiYgbWFzay5zb21lKChieXRlLCBpKSA9PiAoYml0bWFza1tpXSAmIGJ5dGUpICE9PSBieXRlKTtcbiAgICAgIH07XG4gICAgfSxcbiAgfSxcbiAgJHJlZ2V4OiB7XG4gICAgY29tcGlsZUVsZW1lbnRTZWxlY3RvcihvcGVyYW5kLCB2YWx1ZVNlbGVjdG9yKSB7XG4gICAgICBpZiAoISh0eXBlb2Ygb3BlcmFuZCA9PT0gJ3N0cmluZycgfHwgb3BlcmFuZCBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJyRyZWdleCBoYXMgdG8gYmUgYSBzdHJpbmcgb3IgUmVnRXhwJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCByZWdleHA7XG4gICAgICBpZiAodmFsdWVTZWxlY3Rvci4kb3B0aW9ucyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIE9wdGlvbnMgcGFzc2VkIGluICRvcHRpb25zIChldmVuIHRoZSBlbXB0eSBzdHJpbmcpIGFsd2F5cyBvdmVycmlkZXNcbiAgICAgICAgLy8gb3B0aW9ucyBpbiB0aGUgUmVnRXhwIG9iamVjdCBpdHNlbGYuXG5cbiAgICAgICAgLy8gQmUgY2xlYXIgdGhhdCB3ZSBvbmx5IHN1cHBvcnQgdGhlIEpTLXN1cHBvcnRlZCBvcHRpb25zLCBub3QgZXh0ZW5kZWRcbiAgICAgICAgLy8gb25lcyAoZWcsIE1vbmdvIHN1cHBvcnRzIHggYW5kIHMpLiBJZGVhbGx5IHdlIHdvdWxkIGltcGxlbWVudCB4IGFuZCBzXG4gICAgICAgIC8vIGJ5IHRyYW5zZm9ybWluZyB0aGUgcmVnZXhwLCBidXQgbm90IHRvZGF5Li4uXG4gICAgICAgIGlmICgvW15naW1dLy50ZXN0KHZhbHVlU2VsZWN0b3IuJG9wdGlvbnMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdPbmx5IHRoZSBpLCBtLCBhbmQgZyByZWdleHAgb3B0aW9ucyBhcmUgc3VwcG9ydGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzb3VyY2UgPSBvcGVyYW5kIGluc3RhbmNlb2YgUmVnRXhwID8gb3BlcmFuZC5zb3VyY2UgOiBvcGVyYW5kO1xuICAgICAgICByZWdleHAgPSBuZXcgUmVnRXhwKHNvdXJjZSwgdmFsdWVTZWxlY3Rvci4kb3B0aW9ucyk7XG4gICAgICB9IGVsc2UgaWYgKG9wZXJhbmQgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgcmVnZXhwID0gb3BlcmFuZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlZ2V4cCA9IG5ldyBSZWdFeHAob3BlcmFuZCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZWdleHBFbGVtZW50TWF0Y2hlcihyZWdleHApO1xuICAgIH0sXG4gIH0sXG4gICRlbGVtTWF0Y2g6IHtcbiAgICBkb250RXhwYW5kTGVhZkFycmF5czogdHJ1ZSxcbiAgICBjb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQsIHZhbHVlU2VsZWN0b3IsIG1hdGNoZXIpIHtcbiAgICAgIGlmICghTG9jYWxDb2xsZWN0aW9uLl9pc1BsYWluT2JqZWN0KG9wZXJhbmQpKSB7XG4gICAgICAgIHRocm93IEVycm9yKCckZWxlbU1hdGNoIG5lZWQgYW4gb2JqZWN0Jyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlzRG9jTWF0Y2hlciA9ICFpc09wZXJhdG9yT2JqZWN0KFxuICAgICAgICBPYmplY3Qua2V5cyhvcGVyYW5kKVxuICAgICAgICAgIC5maWx0ZXIoa2V5ID0+ICFoYXNPd24uY2FsbChMT0dJQ0FMX09QRVJBVE9SUywga2V5KSlcbiAgICAgICAgICAucmVkdWNlKChhLCBiKSA9PiBPYmplY3QuYXNzaWduKGEsIHtbYl06IG9wZXJhbmRbYl19KSwge30pLFxuICAgICAgICB0cnVlKTtcblxuICAgICAgbGV0IHN1Yk1hdGNoZXI7XG4gICAgICBpZiAoaXNEb2NNYXRjaGVyKSB7XG4gICAgICAgIC8vIFRoaXMgaXMgTk9UIHRoZSBzYW1lIGFzIGNvbXBpbGVWYWx1ZVNlbGVjdG9yKG9wZXJhbmQpLCBhbmQgbm90IGp1c3RcbiAgICAgICAgLy8gYmVjYXVzZSBvZiB0aGUgc2xpZ2h0bHkgZGlmZmVyZW50IGNhbGxpbmcgY29udmVudGlvbi5cbiAgICAgICAgLy8geyRlbGVtTWF0Y2g6IHt4OiAzfX0gbWVhbnMgXCJhbiBlbGVtZW50IGhhcyBhIGZpZWxkIHg6M1wiLCBub3RcbiAgICAgICAgLy8gXCJjb25zaXN0cyBvbmx5IG9mIGEgZmllbGQgeDozXCIuIEFsc28sIHJlZ2V4cHMgYW5kIHN1Yi0kIGFyZSBhbGxvd2VkLlxuICAgICAgICBzdWJNYXRjaGVyID1cbiAgICAgICAgICBjb21waWxlRG9jdW1lbnRTZWxlY3RvcihvcGVyYW5kLCBtYXRjaGVyLCB7aW5FbGVtTWF0Y2g6IHRydWV9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN1Yk1hdGNoZXIgPSBjb21waWxlVmFsdWVTZWxlY3RvcihvcGVyYW5kLCBtYXRjaGVyKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHZhbHVlID0+IHtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBjb25zdCBhcnJheUVsZW1lbnQgPSB2YWx1ZVtpXTtcbiAgICAgICAgICBsZXQgYXJnO1xuICAgICAgICAgIGlmIChpc0RvY01hdGNoZXIpIHtcbiAgICAgICAgICAgIC8vIFdlIGNhbiBvbmx5IG1hdGNoIHskZWxlbU1hdGNoOiB7YjogM319IGFnYWluc3Qgb2JqZWN0cy5cbiAgICAgICAgICAgIC8vIChXZSBjYW4gYWxzbyBtYXRjaCBhZ2FpbnN0IGFycmF5cywgaWYgdGhlcmUncyBudW1lcmljIGluZGljZXMsXG4gICAgICAgICAgICAvLyBlZyB7JGVsZW1NYXRjaDogeycwLmInOiAzfX0gb3IgeyRlbGVtTWF0Y2g6IHswOiAzfX0uKVxuICAgICAgICAgICAgaWYgKCFpc0luZGV4YWJsZShhcnJheUVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYXJnID0gYXJyYXlFbGVtZW50O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBkb250SXRlcmF0ZSBlbnN1cmVzIHRoYXQge2E6IHskZWxlbU1hdGNoOiB7JGd0OiA1fX19IG1hdGNoZXNcbiAgICAgICAgICAgIC8vIHthOiBbOF19IGJ1dCBub3Qge2E6IFtbOF1dfVxuICAgICAgICAgICAgYXJnID0gW3t2YWx1ZTogYXJyYXlFbGVtZW50LCBkb250SXRlcmF0ZTogdHJ1ZX1dO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBYWFggc3VwcG9ydCAkbmVhciBpbiAkZWxlbU1hdGNoIGJ5IHByb3BhZ2F0aW5nICRkaXN0YW5jZT9cbiAgICAgICAgICBpZiAoc3ViTWF0Y2hlcihhcmcpLnJlc3VsdCkge1xuICAgICAgICAgICAgcmV0dXJuIGk7IC8vIHNwZWNpYWxseSB1bmRlcnN0b29kIHRvIG1lYW4gXCJ1c2UgYXMgYXJyYXlJbmRpY2VzXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9O1xuICAgIH0sXG4gIH0sXG59O1xuXG4vLyBPcGVyYXRvcnMgdGhhdCBhcHBlYXIgYXQgdGhlIHRvcCBsZXZlbCBvZiBhIGRvY3VtZW50IHNlbGVjdG9yLlxuY29uc3QgTE9HSUNBTF9PUEVSQVRPUlMgPSB7XG4gICRhbmQoc3ViU2VsZWN0b3IsIG1hdGNoZXIsIGluRWxlbU1hdGNoKSB7XG4gICAgcmV0dXJuIGFuZERvY3VtZW50TWF0Y2hlcnMoXG4gICAgICBjb21waWxlQXJyYXlPZkRvY3VtZW50U2VsZWN0b3JzKHN1YlNlbGVjdG9yLCBtYXRjaGVyLCBpbkVsZW1NYXRjaClcbiAgICApO1xuICB9LFxuXG4gICRvcihzdWJTZWxlY3RvciwgbWF0Y2hlciwgaW5FbGVtTWF0Y2gpIHtcbiAgICBjb25zdCBtYXRjaGVycyA9IGNvbXBpbGVBcnJheU9mRG9jdW1lbnRTZWxlY3RvcnMoXG4gICAgICBzdWJTZWxlY3RvcixcbiAgICAgIG1hdGNoZXIsXG4gICAgICBpbkVsZW1NYXRjaFxuICAgICk7XG5cbiAgICAvLyBTcGVjaWFsIGNhc2U6IGlmIHRoZXJlIGlzIG9ubHkgb25lIG1hdGNoZXIsIHVzZSBpdCBkaXJlY3RseSwgKnByZXNlcnZpbmcqXG4gICAgLy8gYW55IGFycmF5SW5kaWNlcyBpdCByZXR1cm5zLlxuICAgIGlmIChtYXRjaGVycy5sZW5ndGggPT09IDEpIHtcbiAgICAgIHJldHVybiBtYXRjaGVyc1swXTtcbiAgICB9XG5cbiAgICByZXR1cm4gZG9jID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IG1hdGNoZXJzLnNvbWUoZm4gPT4gZm4oZG9jKS5yZXN1bHQpO1xuICAgICAgLy8gJG9yIGRvZXMgTk9UIHNldCBhcnJheUluZGljZXMgd2hlbiBpdCBoYXMgbXVsdGlwbGVcbiAgICAgIC8vIHN1Yi1leHByZXNzaW9ucy4gKFRlc3RlZCBhZ2FpbnN0IE1vbmdvREIuKVxuICAgICAgcmV0dXJuIHtyZXN1bHR9O1xuICAgIH07XG4gIH0sXG5cbiAgJG5vcihzdWJTZWxlY3RvciwgbWF0Y2hlciwgaW5FbGVtTWF0Y2gpIHtcbiAgICBjb25zdCBtYXRjaGVycyA9IGNvbXBpbGVBcnJheU9mRG9jdW1lbnRTZWxlY3RvcnMoXG4gICAgICBzdWJTZWxlY3RvcixcbiAgICAgIG1hdGNoZXIsXG4gICAgICBpbkVsZW1NYXRjaFxuICAgICk7XG4gICAgcmV0dXJuIGRvYyA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBtYXRjaGVycy5ldmVyeShmbiA9PiAhZm4oZG9jKS5yZXN1bHQpO1xuICAgICAgLy8gTmV2ZXIgc2V0IGFycmF5SW5kaWNlcywgYmVjYXVzZSB3ZSBvbmx5IG1hdGNoIGlmIG5vdGhpbmcgaW4gcGFydGljdWxhclxuICAgICAgLy8gJ21hdGNoZWQnIChhbmQgYmVjYXVzZSB0aGlzIGlzIGNvbnNpc3RlbnQgd2l0aCBNb25nb0RCKS5cbiAgICAgIHJldHVybiB7cmVzdWx0fTtcbiAgICB9O1xuICB9LFxuXG4gICR3aGVyZShzZWxlY3RvclZhbHVlLCBtYXRjaGVyKSB7XG4gICAgLy8gUmVjb3JkIHRoYXQgKmFueSogcGF0aCBtYXkgYmUgdXNlZC5cbiAgICBtYXRjaGVyLl9yZWNvcmRQYXRoVXNlZCgnJyk7XG4gICAgbWF0Y2hlci5faGFzV2hlcmUgPSB0cnVlO1xuXG4gICAgaWYgKCEoc2VsZWN0b3JWYWx1ZSBpbnN0YW5jZW9mIEZ1bmN0aW9uKSkge1xuICAgICAgLy8gWFhYIE1vbmdvREIgc2VlbXMgdG8gaGF2ZSBtb3JlIGNvbXBsZXggbG9naWMgdG8gZGVjaWRlIHdoZXJlIG9yIG9yIG5vdFxuICAgICAgLy8gdG8gYWRkICdyZXR1cm4nOyBub3Qgc3VyZSBleGFjdGx5IHdoYXQgaXQgaXMuXG4gICAgICBzZWxlY3RvclZhbHVlID0gRnVuY3Rpb24oJ29iaicsIGByZXR1cm4gJHtzZWxlY3RvclZhbHVlfWApO1xuICAgIH1cblxuICAgIC8vIFdlIG1ha2UgdGhlIGRvY3VtZW50IGF2YWlsYWJsZSBhcyBib3RoIGB0aGlzYCBhbmQgYG9iamAuXG4gICAgLy8gLy8gWFhYIG5vdCBzdXJlIHdoYXQgd2Ugc2hvdWxkIGRvIGlmIHRoaXMgdGhyb3dzXG4gICAgcmV0dXJuIGRvYyA9PiAoe3Jlc3VsdDogc2VsZWN0b3JWYWx1ZS5jYWxsKGRvYywgZG9jKX0pO1xuICB9LFxuXG4gIC8vIFRoaXMgaXMganVzdCB1c2VkIGFzIGEgY29tbWVudCBpbiB0aGUgcXVlcnkgKGluIE1vbmdvREIsIGl0IGFsc28gZW5kcyB1cCBpblxuICAvLyBxdWVyeSBsb2dzKTsgaXQgaGFzIG5vIGVmZmVjdCBvbiB0aGUgYWN0dWFsIHNlbGVjdGlvbi5cbiAgJGNvbW1lbnQoKSB7XG4gICAgcmV0dXJuICgpID0+ICh7cmVzdWx0OiB0cnVlfSk7XG4gIH0sXG59O1xuXG4vLyBPcGVyYXRvcnMgdGhhdCAodW5saWtlIExPR0lDQUxfT1BFUkFUT1JTKSBwZXJ0YWluIHRvIGluZGl2aWR1YWwgcGF0aHMgaW4gYVxuLy8gZG9jdW1lbnQsIGJ1dCAodW5saWtlIEVMRU1FTlRfT1BFUkFUT1JTKSBkbyBub3QgaGF2ZSBhIHNpbXBsZSBkZWZpbml0aW9uIGFzXG4vLyBcIm1hdGNoIGVhY2ggYnJhbmNoZWQgdmFsdWUgaW5kZXBlbmRlbnRseSBhbmQgY29tYmluZSB3aXRoXG4vLyBjb252ZXJ0RWxlbWVudE1hdGNoZXJUb0JyYW5jaGVkTWF0Y2hlclwiLlxuY29uc3QgVkFMVUVfT1BFUkFUT1JTID0ge1xuICAkZXEob3BlcmFuZCkge1xuICAgIHJldHVybiBjb252ZXJ0RWxlbWVudE1hdGNoZXJUb0JyYW5jaGVkTWF0Y2hlcihcbiAgICAgIGVxdWFsaXR5RWxlbWVudE1hdGNoZXIob3BlcmFuZClcbiAgICApO1xuICB9LFxuICAkbm90KG9wZXJhbmQsIHZhbHVlU2VsZWN0b3IsIG1hdGNoZXIpIHtcbiAgICByZXR1cm4gaW52ZXJ0QnJhbmNoZWRNYXRjaGVyKGNvbXBpbGVWYWx1ZVNlbGVjdG9yKG9wZXJhbmQsIG1hdGNoZXIpKTtcbiAgfSxcbiAgJG5lKG9wZXJhbmQpIHtcbiAgICByZXR1cm4gaW52ZXJ0QnJhbmNoZWRNYXRjaGVyKFxuICAgICAgY29udmVydEVsZW1lbnRNYXRjaGVyVG9CcmFuY2hlZE1hdGNoZXIoZXF1YWxpdHlFbGVtZW50TWF0Y2hlcihvcGVyYW5kKSlcbiAgICApO1xuICB9LFxuICAkbmluKG9wZXJhbmQpIHtcbiAgICByZXR1cm4gaW52ZXJ0QnJhbmNoZWRNYXRjaGVyKFxuICAgICAgY29udmVydEVsZW1lbnRNYXRjaGVyVG9CcmFuY2hlZE1hdGNoZXIoXG4gICAgICAgIEVMRU1FTlRfT1BFUkFUT1JTLiRpbi5jb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQpXG4gICAgICApXG4gICAgKTtcbiAgfSxcbiAgJGV4aXN0cyhvcGVyYW5kKSB7XG4gICAgY29uc3QgZXhpc3RzID0gY29udmVydEVsZW1lbnRNYXRjaGVyVG9CcmFuY2hlZE1hdGNoZXIoXG4gICAgICB2YWx1ZSA9PiB2YWx1ZSAhPT0gdW5kZWZpbmVkXG4gICAgKTtcbiAgICByZXR1cm4gb3BlcmFuZCA/IGV4aXN0cyA6IGludmVydEJyYW5jaGVkTWF0Y2hlcihleGlzdHMpO1xuICB9LFxuICAvLyAkb3B0aW9ucyBqdXN0IHByb3ZpZGVzIG9wdGlvbnMgZm9yICRyZWdleDsgaXRzIGxvZ2ljIGlzIGluc2lkZSAkcmVnZXhcbiAgJG9wdGlvbnMob3BlcmFuZCwgdmFsdWVTZWxlY3Rvcikge1xuICAgIGlmICghaGFzT3duLmNhbGwodmFsdWVTZWxlY3RvciwgJyRyZWdleCcpKSB7XG4gICAgICB0aHJvdyBFcnJvcignJG9wdGlvbnMgbmVlZHMgYSAkcmVnZXgnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZXZlcnl0aGluZ01hdGNoZXI7XG4gIH0sXG4gIC8vICRtYXhEaXN0YW5jZSBpcyBiYXNpY2FsbHkgYW4gYXJndW1lbnQgdG8gJG5lYXJcbiAgJG1heERpc3RhbmNlKG9wZXJhbmQsIHZhbHVlU2VsZWN0b3IpIHtcbiAgICBpZiAoIXZhbHVlU2VsZWN0b3IuJG5lYXIpIHtcbiAgICAgIHRocm93IEVycm9yKCckbWF4RGlzdGFuY2UgbmVlZHMgYSAkbmVhcicpO1xuICAgIH1cblxuICAgIHJldHVybiBldmVyeXRoaW5nTWF0Y2hlcjtcbiAgfSxcbiAgJGFsbChvcGVyYW5kLCB2YWx1ZVNlbGVjdG9yLCBtYXRjaGVyKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wZXJhbmQpKSB7XG4gICAgICB0aHJvdyBFcnJvcignJGFsbCByZXF1aXJlcyBhcnJheScpO1xuICAgIH1cblxuICAgIC8vIE5vdCBzdXJlIHdoeSwgYnV0IHRoaXMgc2VlbXMgdG8gYmUgd2hhdCBNb25nb0RCIGRvZXMuXG4gICAgaWYgKG9wZXJhbmQubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gbm90aGluZ01hdGNoZXI7XG4gICAgfVxuXG4gICAgY29uc3QgYnJhbmNoZWRNYXRjaGVycyA9IG9wZXJhbmQubWFwKGNyaXRlcmlvbiA9PiB7XG4gICAgICAvLyBYWFggaGFuZGxlICRhbGwvJGVsZW1NYXRjaCBjb21iaW5hdGlvblxuICAgICAgaWYgKGlzT3BlcmF0b3JPYmplY3QoY3JpdGVyaW9uKSkge1xuICAgICAgICB0aHJvdyBFcnJvcignbm8gJCBleHByZXNzaW9ucyBpbiAkYWxsJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFRoaXMgaXMgYWx3YXlzIGEgcmVnZXhwIG9yIGVxdWFsaXR5IHNlbGVjdG9yLlxuICAgICAgcmV0dXJuIGNvbXBpbGVWYWx1ZVNlbGVjdG9yKGNyaXRlcmlvbiwgbWF0Y2hlcik7XG4gICAgfSk7XG5cbiAgICAvLyBhbmRCcmFuY2hlZE1hdGNoZXJzIGRvZXMgTk9UIHJlcXVpcmUgYWxsIHNlbGVjdG9ycyB0byByZXR1cm4gdHJ1ZSBvbiB0aGVcbiAgICAvLyBTQU1FIGJyYW5jaC5cbiAgICByZXR1cm4gYW5kQnJhbmNoZWRNYXRjaGVycyhicmFuY2hlZE1hdGNoZXJzKTtcbiAgfSxcbiAgJG5lYXIob3BlcmFuZCwgdmFsdWVTZWxlY3RvciwgbWF0Y2hlciwgaXNSb290KSB7XG4gICAgaWYgKCFpc1Jvb3QpIHtcbiAgICAgIHRocm93IEVycm9yKCckbmVhciBjYW5cXCd0IGJlIGluc2lkZSBhbm90aGVyICQgb3BlcmF0b3InKTtcbiAgICB9XG5cbiAgICBtYXRjaGVyLl9oYXNHZW9RdWVyeSA9IHRydWU7XG5cbiAgICAvLyBUaGVyZSBhcmUgdHdvIGtpbmRzIG9mIGdlb2RhdGEgaW4gTW9uZ29EQjogbGVnYWN5IGNvb3JkaW5hdGUgcGFpcnMgYW5kXG4gICAgLy8gR2VvSlNPTi4gVGhleSB1c2UgZGlmZmVyZW50IGRpc3RhbmNlIG1ldHJpY3MsIHRvby4gR2VvSlNPTiBxdWVyaWVzIGFyZVxuICAgIC8vIG1hcmtlZCB3aXRoIGEgJGdlb21ldHJ5IHByb3BlcnR5LCB0aG91Z2ggbGVnYWN5IGNvb3JkaW5hdGVzIGNhbiBiZVxuICAgIC8vIG1hdGNoZWQgdXNpbmcgJGdlb21ldHJ5LlxuICAgIGxldCBtYXhEaXN0YW5jZSwgcG9pbnQsIGRpc3RhbmNlO1xuICAgIGlmIChMb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3Qob3BlcmFuZCkgJiYgaGFzT3duLmNhbGwob3BlcmFuZCwgJyRnZW9tZXRyeScpKSB7XG4gICAgICAvLyBHZW9KU09OIFwiMmRzcGhlcmVcIiBtb2RlLlxuICAgICAgbWF4RGlzdGFuY2UgPSBvcGVyYW5kLiRtYXhEaXN0YW5jZTtcbiAgICAgIHBvaW50ID0gb3BlcmFuZC4kZ2VvbWV0cnk7XG4gICAgICBkaXN0YW5jZSA9IHZhbHVlID0+IHtcbiAgICAgICAgLy8gWFhYOiBmb3Igbm93LCB3ZSBkb24ndCBjYWxjdWxhdGUgdGhlIGFjdHVhbCBkaXN0YW5jZSBiZXR3ZWVuLCBzYXksXG4gICAgICAgIC8vIHBvbHlnb24gYW5kIGNpcmNsZS4gSWYgcGVvcGxlIGNhcmUgYWJvdXQgdGhpcyB1c2UtY2FzZSBpdCB3aWxsIGdldFxuICAgICAgICAvLyBhIHByaW9yaXR5LlxuICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXZhbHVlLnR5cGUpIHtcbiAgICAgICAgICByZXR1cm4gR2VvSlNPTi5wb2ludERpc3RhbmNlKFxuICAgICAgICAgICAgcG9pbnQsXG4gICAgICAgICAgICB7dHlwZTogJ1BvaW50JywgY29vcmRpbmF0ZXM6IHBvaW50VG9BcnJheSh2YWx1ZSl9XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZS50eXBlID09PSAnUG9pbnQnKSB7XG4gICAgICAgICAgcmV0dXJuIEdlb0pTT04ucG9pbnREaXN0YW5jZShwb2ludCwgdmFsdWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIEdlb0pTT04uZ2VvbWV0cnlXaXRoaW5SYWRpdXModmFsdWUsIHBvaW50LCBtYXhEaXN0YW5jZSlcbiAgICAgICAgICA/IDBcbiAgICAgICAgICA6IG1heERpc3RhbmNlICsgMTtcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIG1heERpc3RhbmNlID0gdmFsdWVTZWxlY3Rvci4kbWF4RGlzdGFuY2U7XG5cbiAgICAgIGlmICghaXNJbmRleGFibGUob3BlcmFuZCkpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJyRuZWFyIGFyZ3VtZW50IG11c3QgYmUgY29vcmRpbmF0ZSBwYWlyIG9yIEdlb0pTT04nKTtcbiAgICAgIH1cblxuICAgICAgcG9pbnQgPSBwb2ludFRvQXJyYXkob3BlcmFuZCk7XG5cbiAgICAgIGRpc3RhbmNlID0gdmFsdWUgPT4ge1xuICAgICAgICBpZiAoIWlzSW5kZXhhYmxlKHZhbHVlKSkge1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGRpc3RhbmNlQ29vcmRpbmF0ZVBhaXJzKHBvaW50LCB2YWx1ZSk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBicmFuY2hlZFZhbHVlcyA9PiB7XG4gICAgICAvLyBUaGVyZSBtaWdodCBiZSBtdWx0aXBsZSBwb2ludHMgaW4gdGhlIGRvY3VtZW50IHRoYXQgbWF0Y2ggdGhlIGdpdmVuXG4gICAgICAvLyBmaWVsZC4gT25seSBvbmUgb2YgdGhlbSBuZWVkcyB0byBiZSB3aXRoaW4gJG1heERpc3RhbmNlLCBidXQgd2UgbmVlZCB0b1xuICAgICAgLy8gZXZhbHVhdGUgYWxsIG9mIHRoZW0gYW5kIHVzZSB0aGUgbmVhcmVzdCBvbmUgZm9yIHRoZSBpbXBsaWNpdCBzb3J0XG4gICAgICAvLyBzcGVjaWZpZXIuIChUaGF0J3Mgd2h5IHdlIGNhbid0IGp1c3QgdXNlIEVMRU1FTlRfT1BFUkFUT1JTIGhlcmUuKVxuICAgICAgLy9cbiAgICAgIC8vIE5vdGU6IFRoaXMgZGlmZmVycyBmcm9tIE1vbmdvREIncyBpbXBsZW1lbnRhdGlvbiwgd2hlcmUgYSBkb2N1bWVudCB3aWxsXG4gICAgICAvLyBhY3R1YWxseSBzaG93IHVwICptdWx0aXBsZSB0aW1lcyogaW4gdGhlIHJlc3VsdCBzZXQsIHdpdGggb25lIGVudHJ5IGZvclxuICAgICAgLy8gZWFjaCB3aXRoaW4tJG1heERpc3RhbmNlIGJyYW5jaGluZyBwb2ludC5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IHtyZXN1bHQ6IGZhbHNlfTtcbiAgICAgIGV4cGFuZEFycmF5c0luQnJhbmNoZXMoYnJhbmNoZWRWYWx1ZXMpLmV2ZXJ5KGJyYW5jaCA9PiB7XG4gICAgICAgIC8vIGlmIG9wZXJhdGlvbiBpcyBhbiB1cGRhdGUsIGRvbid0IHNraXAgYnJhbmNoZXMsIGp1c3QgcmV0dXJuIHRoZSBmaXJzdFxuICAgICAgICAvLyBvbmUgKCMzNTk5KVxuICAgICAgICBsZXQgY3VyRGlzdGFuY2U7XG4gICAgICAgIGlmICghbWF0Y2hlci5faXNVcGRhdGUpIHtcbiAgICAgICAgICBpZiAoISh0eXBlb2YgYnJhbmNoLnZhbHVlID09PSAnb2JqZWN0JykpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGN1ckRpc3RhbmNlID0gZGlzdGFuY2UoYnJhbmNoLnZhbHVlKTtcblxuICAgICAgICAgIC8vIFNraXAgYnJhbmNoZXMgdGhhdCBhcmVuJ3QgcmVhbCBwb2ludHMgb3IgYXJlIHRvbyBmYXIgYXdheS5cbiAgICAgICAgICBpZiAoY3VyRGlzdGFuY2UgPT09IG51bGwgfHwgY3VyRGlzdGFuY2UgPiBtYXhEaXN0YW5jZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gU2tpcCBhbnl0aGluZyB0aGF0J3MgYSB0aWUuXG4gICAgICAgICAgaWYgKHJlc3VsdC5kaXN0YW5jZSAhPT0gdW5kZWZpbmVkICYmIHJlc3VsdC5kaXN0YW5jZSA8PSBjdXJEaXN0YW5jZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0LnJlc3VsdCA9IHRydWU7XG4gICAgICAgIHJlc3VsdC5kaXN0YW5jZSA9IGN1ckRpc3RhbmNlO1xuXG4gICAgICAgIGlmIChicmFuY2guYXJyYXlJbmRpY2VzKSB7XG4gICAgICAgICAgcmVzdWx0LmFycmF5SW5kaWNlcyA9IGJyYW5jaC5hcnJheUluZGljZXM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVsZXRlIHJlc3VsdC5hcnJheUluZGljZXM7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIW1hdGNoZXIuX2lzVXBkYXRlO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfSxcbn07XG5cbi8vIE5COiBXZSBhcmUgY2hlYXRpbmcgYW5kIHVzaW5nIHRoaXMgZnVuY3Rpb24gdG8gaW1wbGVtZW50ICdBTkQnIGZvciBib3RoXG4vLyAnZG9jdW1lbnQgbWF0Y2hlcnMnIGFuZCAnYnJhbmNoZWQgbWF0Y2hlcnMnLiBUaGV5IGJvdGggcmV0dXJuIHJlc3VsdCBvYmplY3RzXG4vLyBidXQgdGhlIGFyZ3VtZW50IGlzIGRpZmZlcmVudDogZm9yIHRoZSBmb3JtZXIgaXQncyBhIHdob2xlIGRvYywgd2hlcmVhcyBmb3Jcbi8vIHRoZSBsYXR0ZXIgaXQncyBhbiBhcnJheSBvZiAnYnJhbmNoZWQgdmFsdWVzJy5cbmZ1bmN0aW9uIGFuZFNvbWVNYXRjaGVycyhzdWJNYXRjaGVycykge1xuICBpZiAoc3ViTWF0Y2hlcnMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIGV2ZXJ5dGhpbmdNYXRjaGVyO1xuICB9XG5cbiAgaWYgKHN1Yk1hdGNoZXJzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBzdWJNYXRjaGVyc1swXTtcbiAgfVxuXG4gIHJldHVybiBkb2NPckJyYW5jaGVzID0+IHtcbiAgICBjb25zdCBtYXRjaCA9IHt9O1xuICAgIG1hdGNoLnJlc3VsdCA9IHN1Yk1hdGNoZXJzLmV2ZXJ5KGZuID0+IHtcbiAgICAgIGNvbnN0IHN1YlJlc3VsdCA9IGZuKGRvY09yQnJhbmNoZXMpO1xuXG4gICAgICAvLyBDb3B5IGEgJ2Rpc3RhbmNlJyBudW1iZXIgb3V0IG9mIHRoZSBmaXJzdCBzdWItbWF0Y2hlciB0aGF0IGhhc1xuICAgICAgLy8gb25lLiBZZXMsIHRoaXMgbWVhbnMgdGhhdCBpZiB0aGVyZSBhcmUgbXVsdGlwbGUgJG5lYXIgZmllbGRzIGluIGFcbiAgICAgIC8vIHF1ZXJ5LCBzb21ldGhpbmcgYXJiaXRyYXJ5IGhhcHBlbnM7IHRoaXMgYXBwZWFycyB0byBiZSBjb25zaXN0ZW50IHdpdGhcbiAgICAgIC8vIE1vbmdvLlxuICAgICAgaWYgKHN1YlJlc3VsdC5yZXN1bHQgJiZcbiAgICAgICAgICBzdWJSZXN1bHQuZGlzdGFuY2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgIG1hdGNoLmRpc3RhbmNlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgbWF0Y2guZGlzdGFuY2UgPSBzdWJSZXN1bHQuZGlzdGFuY2U7XG4gICAgICB9XG5cbiAgICAgIC8vIFNpbWlsYXJseSwgcHJvcGFnYXRlIGFycmF5SW5kaWNlcyBmcm9tIHN1Yi1tYXRjaGVycy4uLiBidXQgdG8gbWF0Y2hcbiAgICAgIC8vIE1vbmdvREIgYmVoYXZpb3IsIHRoaXMgdGltZSB0aGUgKmxhc3QqIHN1Yi1tYXRjaGVyIHdpdGggYXJyYXlJbmRpY2VzXG4gICAgICAvLyB3aW5zLlxuICAgICAgaWYgKHN1YlJlc3VsdC5yZXN1bHQgJiYgc3ViUmVzdWx0LmFycmF5SW5kaWNlcykge1xuICAgICAgICBtYXRjaC5hcnJheUluZGljZXMgPSBzdWJSZXN1bHQuYXJyYXlJbmRpY2VzO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gc3ViUmVzdWx0LnJlc3VsdDtcbiAgICB9KTtcblxuICAgIC8vIElmIHdlIGRpZG4ndCBhY3R1YWxseSBtYXRjaCwgZm9yZ2V0IGFueSBleHRyYSBtZXRhZGF0YSB3ZSBjYW1lIHVwIHdpdGguXG4gICAgaWYgKCFtYXRjaC5yZXN1bHQpIHtcbiAgICAgIGRlbGV0ZSBtYXRjaC5kaXN0YW5jZTtcbiAgICAgIGRlbGV0ZSBtYXRjaC5hcnJheUluZGljZXM7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1hdGNoO1xuICB9O1xufVxuXG5jb25zdCBhbmREb2N1bWVudE1hdGNoZXJzID0gYW5kU29tZU1hdGNoZXJzO1xuY29uc3QgYW5kQnJhbmNoZWRNYXRjaGVycyA9IGFuZFNvbWVNYXRjaGVycztcblxuZnVuY3Rpb24gY29tcGlsZUFycmF5T2ZEb2N1bWVudFNlbGVjdG9ycyhzZWxlY3RvcnMsIG1hdGNoZXIsIGluRWxlbU1hdGNoKSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShzZWxlY3RvcnMpIHx8IHNlbGVjdG9ycy5sZW5ndGggPT09IDApIHtcbiAgICB0aHJvdyBFcnJvcignJGFuZC8kb3IvJG5vciBtdXN0IGJlIG5vbmVtcHR5IGFycmF5Jyk7XG4gIH1cblxuICByZXR1cm4gc2VsZWN0b3JzLm1hcChzdWJTZWxlY3RvciA9PiB7XG4gICAgaWYgKCFMb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3Qoc3ViU2VsZWN0b3IpKSB7XG4gICAgICB0aHJvdyBFcnJvcignJG9yLyRhbmQvJG5vciBlbnRyaWVzIG5lZWQgdG8gYmUgZnVsbCBvYmplY3RzJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbXBpbGVEb2N1bWVudFNlbGVjdG9yKHN1YlNlbGVjdG9yLCBtYXRjaGVyLCB7aW5FbGVtTWF0Y2h9KTtcbiAgfSk7XG59XG5cbi8vIFRha2VzIGluIGEgc2VsZWN0b3IgdGhhdCBjb3VsZCBtYXRjaCBhIGZ1bGwgZG9jdW1lbnQgKGVnLCB0aGUgb3JpZ2luYWxcbi8vIHNlbGVjdG9yKS4gUmV0dXJucyBhIGZ1bmN0aW9uIG1hcHBpbmcgZG9jdW1lbnQtPnJlc3VsdCBvYmplY3QuXG4vL1xuLy8gbWF0Y2hlciBpcyB0aGUgTWF0Y2hlciBvYmplY3Qgd2UgYXJlIGNvbXBpbGluZy5cbi8vXG4vLyBJZiB0aGlzIGlzIHRoZSByb290IGRvY3VtZW50IHNlbGVjdG9yIChpZSwgbm90IHdyYXBwZWQgaW4gJGFuZCBvciB0aGUgbGlrZSksXG4vLyB0aGVuIGlzUm9vdCBpcyB0cnVlLiAoVGhpcyBpcyB1c2VkIGJ5ICRuZWFyLilcbmV4cG9ydCBmdW5jdGlvbiBjb21waWxlRG9jdW1lbnRTZWxlY3Rvcihkb2NTZWxlY3RvciwgbWF0Y2hlciwgb3B0aW9ucyA9IHt9KSB7XG4gIGNvbnN0IGRvY01hdGNoZXJzID0gT2JqZWN0LmtleXMoZG9jU2VsZWN0b3IpLm1hcChrZXkgPT4ge1xuICAgIGNvbnN0IHN1YlNlbGVjdG9yID0gZG9jU2VsZWN0b3Jba2V5XTtcblxuICAgIGlmIChrZXkuc3Vic3RyKDAsIDEpID09PSAnJCcpIHtcbiAgICAgIC8vIE91dGVyIG9wZXJhdG9ycyBhcmUgZWl0aGVyIGxvZ2ljYWwgb3BlcmF0b3JzICh0aGV5IHJlY3Vyc2UgYmFjayBpbnRvXG4gICAgICAvLyB0aGlzIGZ1bmN0aW9uKSwgb3IgJHdoZXJlLlxuICAgICAgaWYgKCFoYXNPd24uY2FsbChMT0dJQ0FMX09QRVJBVE9SUywga2V5KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVucmVjb2duaXplZCBsb2dpY2FsIG9wZXJhdG9yOiAke2tleX1gKTtcbiAgICAgIH1cblxuICAgICAgbWF0Y2hlci5faXNTaW1wbGUgPSBmYWxzZTtcbiAgICAgIHJldHVybiBMT0dJQ0FMX09QRVJBVE9SU1trZXldKHN1YlNlbGVjdG9yLCBtYXRjaGVyLCBvcHRpb25zLmluRWxlbU1hdGNoKTtcbiAgICB9XG5cbiAgICAvLyBSZWNvcmQgdGhpcyBwYXRoLCBidXQgb25seSBpZiB3ZSBhcmVuJ3QgaW4gYW4gZWxlbU1hdGNoZXIsIHNpbmNlIGluIGFuXG4gICAgLy8gZWxlbU1hdGNoIHRoaXMgaXMgYSBwYXRoIGluc2lkZSBhbiBvYmplY3QgaW4gYW4gYXJyYXksIG5vdCBpbiB0aGUgZG9jXG4gICAgLy8gcm9vdC5cbiAgICBpZiAoIW9wdGlvbnMuaW5FbGVtTWF0Y2gpIHtcbiAgICAgIG1hdGNoZXIuX3JlY29yZFBhdGhVc2VkKGtleSk7XG4gICAgfVxuXG4gICAgLy8gRG9uJ3QgYWRkIGEgbWF0Y2hlciBpZiBzdWJTZWxlY3RvciBpcyBhIGZ1bmN0aW9uIC0tIHRoaXMgaXMgdG8gbWF0Y2hcbiAgICAvLyB0aGUgYmVoYXZpb3Igb2YgTWV0ZW9yIG9uIHRoZSBzZXJ2ZXIgKGluaGVyaXRlZCBmcm9tIHRoZSBub2RlIG1vbmdvZGJcbiAgICAvLyBkcml2ZXIpLCB3aGljaCBpcyB0byBpZ25vcmUgYW55IHBhcnQgb2YgYSBzZWxlY3RvciB3aGljaCBpcyBhIGZ1bmN0aW9uLlxuICAgIGlmICh0eXBlb2Ygc3ViU2VsZWN0b3IgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3QgbG9va1VwQnlJbmRleCA9IG1ha2VMb29rdXBGdW5jdGlvbihrZXkpO1xuICAgIGNvbnN0IHZhbHVlTWF0Y2hlciA9IGNvbXBpbGVWYWx1ZVNlbGVjdG9yKFxuICAgICAgc3ViU2VsZWN0b3IsXG4gICAgICBtYXRjaGVyLFxuICAgICAgb3B0aW9ucy5pc1Jvb3RcbiAgICApO1xuXG4gICAgcmV0dXJuIGRvYyA9PiB2YWx1ZU1hdGNoZXIobG9va1VwQnlJbmRleChkb2MpKTtcbiAgfSkuZmlsdGVyKEJvb2xlYW4pO1xuXG4gIHJldHVybiBhbmREb2N1bWVudE1hdGNoZXJzKGRvY01hdGNoZXJzKTtcbn1cblxuLy8gVGFrZXMgaW4gYSBzZWxlY3RvciB0aGF0IGNvdWxkIG1hdGNoIGEga2V5LWluZGV4ZWQgdmFsdWUgaW4gYSBkb2N1bWVudDsgZWcsXG4vLyB7JGd0OiA1LCAkbHQ6IDl9LCBvciBhIHJlZ3VsYXIgZXhwcmVzc2lvbiwgb3IgYW55IG5vbi1leHByZXNzaW9uIG9iamVjdCAodG9cbi8vIGluZGljYXRlIGVxdWFsaXR5KS4gIFJldHVybnMgYSBicmFuY2hlZCBtYXRjaGVyOiBhIGZ1bmN0aW9uIG1hcHBpbmdcbi8vIFticmFuY2hlZCB2YWx1ZV0tPnJlc3VsdCBvYmplY3QuXG5mdW5jdGlvbiBjb21waWxlVmFsdWVTZWxlY3Rvcih2YWx1ZVNlbGVjdG9yLCBtYXRjaGVyLCBpc1Jvb3QpIHtcbiAgaWYgKHZhbHVlU2VsZWN0b3IgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICBtYXRjaGVyLl9pc1NpbXBsZSA9IGZhbHNlO1xuICAgIHJldHVybiBjb252ZXJ0RWxlbWVudE1hdGNoZXJUb0JyYW5jaGVkTWF0Y2hlcihcbiAgICAgIHJlZ2V4cEVsZW1lbnRNYXRjaGVyKHZhbHVlU2VsZWN0b3IpXG4gICAgKTtcbiAgfVxuXG4gIGlmIChpc09wZXJhdG9yT2JqZWN0KHZhbHVlU2VsZWN0b3IpKSB7XG4gICAgcmV0dXJuIG9wZXJhdG9yQnJhbmNoZWRNYXRjaGVyKHZhbHVlU2VsZWN0b3IsIG1hdGNoZXIsIGlzUm9vdCk7XG4gIH1cblxuICByZXR1cm4gY29udmVydEVsZW1lbnRNYXRjaGVyVG9CcmFuY2hlZE1hdGNoZXIoXG4gICAgZXF1YWxpdHlFbGVtZW50TWF0Y2hlcih2YWx1ZVNlbGVjdG9yKVxuICApO1xufVxuXG4vLyBHaXZlbiBhbiBlbGVtZW50IG1hdGNoZXIgKHdoaWNoIGV2YWx1YXRlcyBhIHNpbmdsZSB2YWx1ZSksIHJldHVybnMgYSBicmFuY2hlZFxuLy8gdmFsdWUgKHdoaWNoIGV2YWx1YXRlcyB0aGUgZWxlbWVudCBtYXRjaGVyIG9uIGFsbCB0aGUgYnJhbmNoZXMgYW5kIHJldHVybnMgYVxuLy8gbW9yZSBzdHJ1Y3R1cmVkIHJldHVybiB2YWx1ZSBwb3NzaWJseSBpbmNsdWRpbmcgYXJyYXlJbmRpY2VzKS5cbmZ1bmN0aW9uIGNvbnZlcnRFbGVtZW50TWF0Y2hlclRvQnJhbmNoZWRNYXRjaGVyKGVsZW1lbnRNYXRjaGVyLCBvcHRpb25zID0ge30pIHtcbiAgcmV0dXJuIGJyYW5jaGVzID0+IHtcbiAgICBjb25zdCBleHBhbmRlZCA9IG9wdGlvbnMuZG9udEV4cGFuZExlYWZBcnJheXNcbiAgICAgID8gYnJhbmNoZXNcbiAgICAgIDogZXhwYW5kQXJyYXlzSW5CcmFuY2hlcyhicmFuY2hlcywgb3B0aW9ucy5kb250SW5jbHVkZUxlYWZBcnJheXMpO1xuXG4gICAgY29uc3QgbWF0Y2ggPSB7fTtcbiAgICBtYXRjaC5yZXN1bHQgPSBleHBhbmRlZC5zb21lKGVsZW1lbnQgPT4ge1xuICAgICAgbGV0IG1hdGNoZWQgPSBlbGVtZW50TWF0Y2hlcihlbGVtZW50LnZhbHVlKTtcblxuICAgICAgLy8gU3BlY2lhbCBjYXNlIGZvciAkZWxlbU1hdGNoOiBpdCBtZWFucyBcInRydWUsIGFuZCB1c2UgdGhpcyBhcyBhbiBhcnJheVxuICAgICAgLy8gaW5kZXggaWYgSSBkaWRuJ3QgYWxyZWFkeSBoYXZlIG9uZVwiLlxuICAgICAgaWYgKHR5cGVvZiBtYXRjaGVkID09PSAnbnVtYmVyJykge1xuICAgICAgICAvLyBYWFggVGhpcyBjb2RlIGRhdGVzIGZyb20gd2hlbiB3ZSBvbmx5IHN0b3JlZCBhIHNpbmdsZSBhcnJheSBpbmRleFxuICAgICAgICAvLyAoZm9yIHRoZSBvdXRlcm1vc3QgYXJyYXkpLiBTaG91bGQgd2UgYmUgYWxzbyBpbmNsdWRpbmcgZGVlcGVyIGFycmF5XG4gICAgICAgIC8vIGluZGljZXMgZnJvbSB0aGUgJGVsZW1NYXRjaCBtYXRjaD9cbiAgICAgICAgaWYgKCFlbGVtZW50LmFycmF5SW5kaWNlcykge1xuICAgICAgICAgIGVsZW1lbnQuYXJyYXlJbmRpY2VzID0gW21hdGNoZWRdO1xuICAgICAgICB9XG5cbiAgICAgICAgbWF0Y2hlZCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHNvbWUgZWxlbWVudCBtYXRjaGVkLCBhbmQgaXQncyB0YWdnZWQgd2l0aCBhcnJheSBpbmRpY2VzLCBpbmNsdWRlXG4gICAgICAvLyB0aG9zZSBpbmRpY2VzIGluIG91ciByZXN1bHQgb2JqZWN0LlxuICAgICAgaWYgKG1hdGNoZWQgJiYgZWxlbWVudC5hcnJheUluZGljZXMpIHtcbiAgICAgICAgbWF0Y2guYXJyYXlJbmRpY2VzID0gZWxlbWVudC5hcnJheUluZGljZXM7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBtYXRjaGVkO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIG1hdGNoO1xuICB9O1xufVxuXG4vLyBIZWxwZXJzIGZvciAkbmVhci5cbmZ1bmN0aW9uIGRpc3RhbmNlQ29vcmRpbmF0ZVBhaXJzKGEsIGIpIHtcbiAgY29uc3QgcG9pbnRBID0gcG9pbnRUb0FycmF5KGEpO1xuICBjb25zdCBwb2ludEIgPSBwb2ludFRvQXJyYXkoYik7XG5cbiAgcmV0dXJuIE1hdGguaHlwb3QocG9pbnRBWzBdIC0gcG9pbnRCWzBdLCBwb2ludEFbMV0gLSBwb2ludEJbMV0pO1xufVxuXG4vLyBUYWtlcyBzb21ldGhpbmcgdGhhdCBpcyBub3QgYW4gb3BlcmF0b3Igb2JqZWN0IGFuZCByZXR1cm5zIGFuIGVsZW1lbnQgbWF0Y2hlclxuLy8gZm9yIGVxdWFsaXR5IHdpdGggdGhhdCB0aGluZy5cbmV4cG9ydCBmdW5jdGlvbiBlcXVhbGl0eUVsZW1lbnRNYXRjaGVyKGVsZW1lbnRTZWxlY3Rvcikge1xuICBpZiAoaXNPcGVyYXRvck9iamVjdChlbGVtZW50U2VsZWN0b3IpKSB7XG4gICAgdGhyb3cgRXJyb3IoJ0NhblxcJ3QgY3JlYXRlIGVxdWFsaXR5VmFsdWVTZWxlY3RvciBmb3Igb3BlcmF0b3Igb2JqZWN0Jyk7XG4gIH1cblxuICAvLyBTcGVjaWFsLWNhc2U6IG51bGwgYW5kIHVuZGVmaW5lZCBhcmUgZXF1YWwgKGlmIHlvdSBnb3QgdW5kZWZpbmVkIGluIHRoZXJlXG4gIC8vIHNvbWV3aGVyZSwgb3IgaWYgeW91IGdvdCBpdCBkdWUgdG8gc29tZSBicmFuY2ggYmVpbmcgbm9uLWV4aXN0ZW50IGluIHRoZVxuICAvLyB3ZWlyZCBzcGVjaWFsIGNhc2UpLCBldmVuIHRob3VnaCB0aGV5IGFyZW4ndCB3aXRoIEVKU09OLmVxdWFscy5cbiAgLy8gdW5kZWZpbmVkIG9yIG51bGxcbiAgaWYgKGVsZW1lbnRTZWxlY3RvciA9PSBudWxsKSB7XG4gICAgcmV0dXJuIHZhbHVlID0+IHZhbHVlID09IG51bGw7XG4gIH1cblxuICByZXR1cm4gdmFsdWUgPT4gTG9jYWxDb2xsZWN0aW9uLl9mLl9lcXVhbChlbGVtZW50U2VsZWN0b3IsIHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gZXZlcnl0aGluZ01hdGNoZXIoZG9jT3JCcmFuY2hlZFZhbHVlcykge1xuICByZXR1cm4ge3Jlc3VsdDogdHJ1ZX07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBhbmRBcnJheXNJbkJyYW5jaGVzKGJyYW5jaGVzLCBza2lwVGhlQXJyYXlzKSB7XG4gIGNvbnN0IGJyYW5jaGVzT3V0ID0gW107XG5cbiAgYnJhbmNoZXMuZm9yRWFjaChicmFuY2ggPT4ge1xuICAgIGNvbnN0IHRoaXNJc0FycmF5ID0gQXJyYXkuaXNBcnJheShicmFuY2gudmFsdWUpO1xuXG4gICAgLy8gV2UgaW5jbHVkZSB0aGUgYnJhbmNoIGl0c2VsZiwgKlVOTEVTUyogd2UgaXQncyBhbiBhcnJheSB0aGF0IHdlJ3JlIGdvaW5nXG4gICAgLy8gdG8gaXRlcmF0ZSBhbmQgd2UncmUgdG9sZCB0byBza2lwIGFycmF5cy4gIChUaGF0J3MgcmlnaHQsIHdlIGluY2x1ZGUgc29tZVxuICAgIC8vIGFycmF5cyBldmVuIHNraXBUaGVBcnJheXMgaXMgdHJ1ZTogdGhlc2UgYXJlIGFycmF5cyB0aGF0IHdlcmUgZm91bmQgdmlhXG4gICAgLy8gZXhwbGljaXQgbnVtZXJpY2FsIGluZGljZXMuKVxuICAgIGlmICghKHNraXBUaGVBcnJheXMgJiYgdGhpc0lzQXJyYXkgJiYgIWJyYW5jaC5kb250SXRlcmF0ZSkpIHtcbiAgICAgIGJyYW5jaGVzT3V0LnB1c2goe2FycmF5SW5kaWNlczogYnJhbmNoLmFycmF5SW5kaWNlcywgdmFsdWU6IGJyYW5jaC52YWx1ZX0pO1xuICAgIH1cblxuICAgIGlmICh0aGlzSXNBcnJheSAmJiAhYnJhbmNoLmRvbnRJdGVyYXRlKSB7XG4gICAgICBicmFuY2gudmFsdWUuZm9yRWFjaCgodmFsdWUsIGkpID0+IHtcbiAgICAgICAgYnJhbmNoZXNPdXQucHVzaCh7XG4gICAgICAgICAgYXJyYXlJbmRpY2VzOiAoYnJhbmNoLmFycmF5SW5kaWNlcyB8fCBbXSkuY29uY2F0KGkpLFxuICAgICAgICAgIHZhbHVlXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gYnJhbmNoZXNPdXQ7XG59XG5cbi8vIEhlbHBlcnMgZm9yICRiaXRzQWxsU2V0LyRiaXRzQW55U2V0LyRiaXRzQWxsQ2xlYXIvJGJpdHNBbnlDbGVhci5cbmZ1bmN0aW9uIGdldE9wZXJhbmRCaXRtYXNrKG9wZXJhbmQsIHNlbGVjdG9yKSB7XG4gIC8vIG51bWVyaWMgYml0bWFza1xuICAvLyBZb3UgY2FuIHByb3ZpZGUgYSBudW1lcmljIGJpdG1hc2sgdG8gYmUgbWF0Y2hlZCBhZ2FpbnN0IHRoZSBvcGVyYW5kIGZpZWxkLlxuICAvLyBJdCBtdXN0IGJlIHJlcHJlc2VudGFibGUgYXMgYSBub24tbmVnYXRpdmUgMzItYml0IHNpZ25lZCBpbnRlZ2VyLlxuICAvLyBPdGhlcndpc2UsICRiaXRzQWxsU2V0IHdpbGwgcmV0dXJuIGFuIGVycm9yLlxuICBpZiAoTnVtYmVyLmlzSW50ZWdlcihvcGVyYW5kKSAmJiBvcGVyYW5kID49IDApIHtcbiAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkobmV3IEludDMyQXJyYXkoW29wZXJhbmRdKS5idWZmZXIpO1xuICB9XG5cbiAgLy8gYmluZGF0YSBiaXRtYXNrXG4gIC8vIFlvdSBjYW4gYWxzbyB1c2UgYW4gYXJiaXRyYXJpbHkgbGFyZ2UgQmluRGF0YSBpbnN0YW5jZSBhcyBhIGJpdG1hc2suXG4gIGlmIChFSlNPTi5pc0JpbmFyeShvcGVyYW5kKSkge1xuICAgIHJldHVybiBuZXcgVWludDhBcnJheShvcGVyYW5kLmJ1ZmZlcik7XG4gIH1cblxuICAvLyBwb3NpdGlvbiBsaXN0XG4gIC8vIElmIHF1ZXJ5aW5nIGEgbGlzdCBvZiBiaXQgcG9zaXRpb25zLCBlYWNoIDxwb3NpdGlvbj4gbXVzdCBiZSBhIG5vbi1uZWdhdGl2ZVxuICAvLyBpbnRlZ2VyLiBCaXQgcG9zaXRpb25zIHN0YXJ0IGF0IDAgZnJvbSB0aGUgbGVhc3Qgc2lnbmlmaWNhbnQgYml0LlxuICBpZiAoQXJyYXkuaXNBcnJheShvcGVyYW5kKSAmJlxuICAgICAgb3BlcmFuZC5ldmVyeSh4ID0+IE51bWJlci5pc0ludGVnZXIoeCkgJiYgeCA+PSAwKSkge1xuICAgIGNvbnN0IGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcigoTWF0aC5tYXgoLi4ub3BlcmFuZCkgPj4gMykgKyAxKTtcbiAgICBjb25zdCB2aWV3ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKTtcblxuICAgIG9wZXJhbmQuZm9yRWFjaCh4ID0+IHtcbiAgICAgIHZpZXdbeCA+PiAzXSB8PSAxIDw8ICh4ICYgMHg3KTtcbiAgICB9KTtcblxuICAgIHJldHVybiB2aWV3O1xuICB9XG5cbiAgLy8gYmFkIG9wZXJhbmRcbiAgdGhyb3cgRXJyb3IoXG4gICAgYG9wZXJhbmQgdG8gJHtzZWxlY3Rvcn0gbXVzdCBiZSBhIG51bWVyaWMgYml0bWFzayAocmVwcmVzZW50YWJsZSBhcyBhIGAgK1xuICAgICdub24tbmVnYXRpdmUgMzItYml0IHNpZ25lZCBpbnRlZ2VyKSwgYSBiaW5kYXRhIGJpdG1hc2sgb3IgYW4gYXJyYXkgd2l0aCAnICtcbiAgICAnYml0IHBvc2l0aW9ucyAobm9uLW5lZ2F0aXZlIGludGVnZXJzKSdcbiAgKTtcbn1cblxuZnVuY3Rpb24gZ2V0VmFsdWVCaXRtYXNrKHZhbHVlLCBsZW5ndGgpIHtcbiAgLy8gVGhlIGZpZWxkIHZhbHVlIG11c3QgYmUgZWl0aGVyIG51bWVyaWNhbCBvciBhIEJpbkRhdGEgaW5zdGFuY2UuIE90aGVyd2lzZSxcbiAgLy8gJGJpdHMuLi4gd2lsbCBub3QgbWF0Y2ggdGhlIGN1cnJlbnQgZG9jdW1lbnQuXG5cbiAgLy8gbnVtZXJpY2FsXG4gIGlmIChOdW1iZXIuaXNTYWZlSW50ZWdlcih2YWx1ZSkpIHtcbiAgICAvLyAkYml0cy4uLiB3aWxsIG5vdCBtYXRjaCBudW1lcmljYWwgdmFsdWVzIHRoYXQgY2Fubm90IGJlIHJlcHJlc2VudGVkIGFzIGFcbiAgICAvLyBzaWduZWQgNjQtYml0IGludGVnZXIuIFRoaXMgY2FuIGJlIHRoZSBjYXNlIGlmIGEgdmFsdWUgaXMgZWl0aGVyIHRvb1xuICAgIC8vIGxhcmdlIG9yIHNtYWxsIHRvIGZpdCBpbiBhIHNpZ25lZCA2NC1iaXQgaW50ZWdlciwgb3IgaWYgaXQgaGFzIGFcbiAgICAvLyBmcmFjdGlvbmFsIGNvbXBvbmVudC5cbiAgICBjb25zdCBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoXG4gICAgICBNYXRoLm1heChsZW5ndGgsIDIgKiBVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVClcbiAgICApO1xuXG4gICAgbGV0IHZpZXcgPSBuZXcgVWludDMyQXJyYXkoYnVmZmVyLCAwLCAyKTtcbiAgICB2aWV3WzBdID0gdmFsdWUgJSAoKDEgPDwgMTYpICogKDEgPDwgMTYpKSB8IDA7XG4gICAgdmlld1sxXSA9IHZhbHVlIC8gKCgxIDw8IDE2KSAqICgxIDw8IDE2KSkgfCAwO1xuXG4gICAgLy8gc2lnbiBleHRlbnNpb25cbiAgICBpZiAodmFsdWUgPCAwKSB7XG4gICAgICB2aWV3ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyLCAyKTtcbiAgICAgIHZpZXcuZm9yRWFjaCgoYnl0ZSwgaSkgPT4ge1xuICAgICAgICB2aWV3W2ldID0gMHhmZjtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICB9XG5cbiAgLy8gYmluZGF0YVxuICBpZiAoRUpTT04uaXNCaW5hcnkodmFsdWUpKSB7XG4gICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KHZhbHVlLmJ1ZmZlcik7XG4gIH1cblxuICAvLyBubyBtYXRjaFxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8vIEFjdHVhbGx5IGluc2VydHMgYSBrZXkgdmFsdWUgaW50byB0aGUgc2VsZWN0b3IgZG9jdW1lbnRcbi8vIEhvd2V2ZXIsIHRoaXMgY2hlY2tzIHRoZXJlIGlzIG5vIGFtYmlndWl0eSBpbiBzZXR0aW5nXG4vLyB0aGUgdmFsdWUgZm9yIHRoZSBnaXZlbiBrZXksIHRocm93cyBvdGhlcndpc2VcbmZ1bmN0aW9uIGluc2VydEludG9Eb2N1bWVudChkb2N1bWVudCwga2V5LCB2YWx1ZSkge1xuICBPYmplY3Qua2V5cyhkb2N1bWVudCkuZm9yRWFjaChleGlzdGluZ0tleSA9PiB7XG4gICAgaWYgKFxuICAgICAgKGV4aXN0aW5nS2V5Lmxlbmd0aCA+IGtleS5sZW5ndGggJiYgZXhpc3RpbmdLZXkuaW5kZXhPZihgJHtrZXl9LmApID09PSAwKSB8fFxuICAgICAgKGtleS5sZW5ndGggPiBleGlzdGluZ0tleS5sZW5ndGggJiYga2V5LmluZGV4T2YoYCR7ZXhpc3RpbmdLZXl9LmApID09PSAwKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgY2Fubm90IGluZmVyIHF1ZXJ5IGZpZWxkcyB0byBzZXQsIGJvdGggcGF0aHMgJyR7ZXhpc3RpbmdLZXl9JyBhbmQgYCArXG4gICAgICAgIGAnJHtrZXl9JyBhcmUgbWF0Y2hlZGBcbiAgICAgICk7XG4gICAgfSBlbHNlIGlmIChleGlzdGluZ0tleSA9PT0ga2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBjYW5ub3QgaW5mZXIgcXVlcnkgZmllbGRzIHRvIHNldCwgcGF0aCAnJHtrZXl9JyBpcyBtYXRjaGVkIHR3aWNlYFxuICAgICAgKTtcbiAgICB9XG4gIH0pO1xuXG4gIGRvY3VtZW50W2tleV0gPSB2YWx1ZTtcbn1cblxuLy8gUmV0dXJucyBhIGJyYW5jaGVkIG1hdGNoZXIgdGhhdCBtYXRjaGVzIGlmZiB0aGUgZ2l2ZW4gbWF0Y2hlciBkb2VzIG5vdC5cbi8vIE5vdGUgdGhhdCB0aGlzIGltcGxpY2l0bHkgXCJkZU1vcmdhbml6ZXNcIiB0aGUgd3JhcHBlZCBmdW5jdGlvbi4gIGllLCBpdFxuLy8gbWVhbnMgdGhhdCBBTEwgYnJhbmNoIHZhbHVlcyBuZWVkIHRvIGZhaWwgdG8gbWF0Y2ggaW5uZXJCcmFuY2hlZE1hdGNoZXIuXG5mdW5jdGlvbiBpbnZlcnRCcmFuY2hlZE1hdGNoZXIoYnJhbmNoZWRNYXRjaGVyKSB7XG4gIHJldHVybiBicmFuY2hWYWx1ZXMgPT4ge1xuICAgIC8vIFdlIGV4cGxpY2l0bHkgY2hvb3NlIHRvIHN0cmlwIGFycmF5SW5kaWNlcyBoZXJlOiBpdCBkb2Vzbid0IG1ha2Ugc2Vuc2UgdG9cbiAgICAvLyBzYXkgXCJ1cGRhdGUgdGhlIGFycmF5IGVsZW1lbnQgdGhhdCBkb2VzIG5vdCBtYXRjaCBzb21ldGhpbmdcIiwgYXQgbGVhc3RcbiAgICAvLyBpbiBtb25nby1sYW5kLlxuICAgIHJldHVybiB7cmVzdWx0OiAhYnJhbmNoZWRNYXRjaGVyKGJyYW5jaFZhbHVlcykucmVzdWx0fTtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSW5kZXhhYmxlKG9iaikge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShvYmopIHx8IExvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdChvYmopO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNOdW1lcmljS2V5KHMpIHtcbiAgcmV0dXJuIC9eWzAtOV0rJC8udGVzdChzKTtcbn1cblxuLy8gUmV0dXJucyB0cnVlIGlmIHRoaXMgaXMgYW4gb2JqZWN0IHdpdGggYXQgbGVhc3Qgb25lIGtleSBhbmQgYWxsIGtleXMgYmVnaW5cbi8vIHdpdGggJC4gIFVubGVzcyBpbmNvbnNpc3RlbnRPSyBpcyBzZXQsIHRocm93cyBpZiBzb21lIGtleXMgYmVnaW4gd2l0aCAkIGFuZFxuLy8gb3RoZXJzIGRvbid0LlxuZXhwb3J0IGZ1bmN0aW9uIGlzT3BlcmF0b3JPYmplY3QodmFsdWVTZWxlY3RvciwgaW5jb25zaXN0ZW50T0spIHtcbiAgaWYgKCFMb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3QodmFsdWVTZWxlY3RvcikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBsZXQgdGhlc2VBcmVPcGVyYXRvcnMgPSB1bmRlZmluZWQ7XG4gIE9iamVjdC5rZXlzKHZhbHVlU2VsZWN0b3IpLmZvckVhY2goc2VsS2V5ID0+IHtcbiAgICBjb25zdCB0aGlzSXNPcGVyYXRvciA9IHNlbEtleS5zdWJzdHIoMCwgMSkgPT09ICckJyB8fCBzZWxLZXkgPT09ICdkaWZmJztcblxuICAgIGlmICh0aGVzZUFyZU9wZXJhdG9ycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aGVzZUFyZU9wZXJhdG9ycyA9IHRoaXNJc09wZXJhdG9yO1xuICAgIH0gZWxzZSBpZiAodGhlc2VBcmVPcGVyYXRvcnMgIT09IHRoaXNJc09wZXJhdG9yKSB7XG4gICAgICBpZiAoIWluY29uc2lzdGVudE9LKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgSW5jb25zaXN0ZW50IG9wZXJhdG9yOiAke0pTT04uc3RyaW5naWZ5KHZhbHVlU2VsZWN0b3IpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgdGhlc2VBcmVPcGVyYXRvcnMgPSBmYWxzZTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiAhIXRoZXNlQXJlT3BlcmF0b3JzOyAvLyB7fSBoYXMgbm8gb3BlcmF0b3JzXG59XG5cbi8vIEhlbHBlciBmb3IgJGx0LyRndC8kbHRlLyRndGUuXG5mdW5jdGlvbiBtYWtlSW5lcXVhbGl0eShjbXBWYWx1ZUNvbXBhcmF0b3IpIHtcbiAgcmV0dXJuIHtcbiAgICBjb21waWxlRWxlbWVudFNlbGVjdG9yKG9wZXJhbmQpIHtcbiAgICAgIC8vIEFycmF5cyBuZXZlciBjb21wYXJlIGZhbHNlIHdpdGggbm9uLWFycmF5cyBmb3IgYW55IGluZXF1YWxpdHkuXG4gICAgICAvLyBYWFggVGhpcyB3YXMgYmVoYXZpb3Igd2Ugb2JzZXJ2ZWQgaW4gcHJlLXJlbGVhc2UgTW9uZ29EQiAyLjUsIGJ1dFxuICAgICAgLy8gICAgIGl0IHNlZW1zIHRvIGhhdmUgYmVlbiByZXZlcnRlZC5cbiAgICAgIC8vICAgICBTZWUgaHR0cHM6Ly9qaXJhLm1vbmdvZGIub3JnL2Jyb3dzZS9TRVJWRVItMTE0NDRcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wZXJhbmQpKSB7XG4gICAgICAgIHJldHVybiAoKSA9PiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgLy8gU3BlY2lhbCBjYXNlOiBjb25zaWRlciB1bmRlZmluZWQgYW5kIG51bGwgdGhlIHNhbWUgKHNvIHRydWUgd2l0aFxuICAgICAgLy8gJGd0ZS8kbHRlKS5cbiAgICAgIGlmIChvcGVyYW5kID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgb3BlcmFuZCA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG9wZXJhbmRUeXBlID0gTG9jYWxDb2xsZWN0aW9uLl9mLl90eXBlKG9wZXJhbmQpO1xuXG4gICAgICByZXR1cm4gdmFsdWUgPT4ge1xuICAgICAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENvbXBhcmlzb25zIGFyZSBuZXZlciB0cnVlIGFtb25nIHRoaW5ncyBvZiBkaWZmZXJlbnQgdHlwZSAoZXhjZXB0XG4gICAgICAgIC8vIG51bGwgdnMgdW5kZWZpbmVkKS5cbiAgICAgICAgaWYgKExvY2FsQ29sbGVjdGlvbi5fZi5fdHlwZSh2YWx1ZSkgIT09IG9wZXJhbmRUeXBlKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNtcFZhbHVlQ29tcGFyYXRvcihMb2NhbENvbGxlY3Rpb24uX2YuX2NtcCh2YWx1ZSwgb3BlcmFuZCkpO1xuICAgICAgfTtcbiAgICB9LFxuICB9O1xufVxuXG4vLyBtYWtlTG9va3VwRnVuY3Rpb24oa2V5KSByZXR1cm5zIGEgbG9va3VwIGZ1bmN0aW9uLlxuLy9cbi8vIEEgbG9va3VwIGZ1bmN0aW9uIHRha2VzIGluIGEgZG9jdW1lbnQgYW5kIHJldHVybnMgYW4gYXJyYXkgb2YgbWF0Y2hpbmdcbi8vIGJyYW5jaGVzLiAgSWYgbm8gYXJyYXlzIGFyZSBmb3VuZCB3aGlsZSBsb29raW5nIHVwIHRoZSBrZXksIHRoaXMgYXJyYXkgd2lsbFxuLy8gaGF2ZSBleGFjdGx5IG9uZSBicmFuY2hlcyAocG9zc2libHkgJ3VuZGVmaW5lZCcsIGlmIHNvbWUgc2VnbWVudCBvZiB0aGUga2V5XG4vLyB3YXMgbm90IGZvdW5kKS5cbi8vXG4vLyBJZiBhcnJheXMgYXJlIGZvdW5kIGluIHRoZSBtaWRkbGUsIHRoaXMgY2FuIGhhdmUgbW9yZSB0aGFuIG9uZSBlbGVtZW50LCBzaW5jZVxuLy8gd2UgJ2JyYW5jaCcuIFdoZW4gd2UgJ2JyYW5jaCcsIGlmIHRoZXJlIGFyZSBtb3JlIGtleSBzZWdtZW50cyB0byBsb29rIHVwLFxuLy8gdGhlbiB3ZSBvbmx5IHB1cnN1ZSBicmFuY2hlcyB0aGF0IGFyZSBwbGFpbiBvYmplY3RzIChub3QgYXJyYXlzIG9yIHNjYWxhcnMpLlxuLy8gVGhpcyBtZWFucyB3ZSBjYW4gYWN0dWFsbHkgZW5kIHVwIHdpdGggbm8gYnJhbmNoZXMhXG4vL1xuLy8gV2UgZG8gKk5PVCogYnJhbmNoIG9uIGFycmF5cyB0aGF0IGFyZSBmb3VuZCBhdCB0aGUgZW5kIChpZSwgYXQgdGhlIGxhc3Rcbi8vIGRvdHRlZCBtZW1iZXIgb2YgdGhlIGtleSkuIFdlIGp1c3QgcmV0dXJuIHRoYXQgYXJyYXk7IGlmIHlvdSB3YW50IHRvXG4vLyBlZmZlY3RpdmVseSAnYnJhbmNoJyBvdmVyIHRoZSBhcnJheSdzIHZhbHVlcywgcG9zdC1wcm9jZXNzIHRoZSBsb29rdXBcbi8vIGZ1bmN0aW9uIHdpdGggZXhwYW5kQXJyYXlzSW5CcmFuY2hlcy5cbi8vXG4vLyBFYWNoIGJyYW5jaCBpcyBhbiBvYmplY3Qgd2l0aCBrZXlzOlxuLy8gIC0gdmFsdWU6IHRoZSB2YWx1ZSBhdCB0aGUgYnJhbmNoXG4vLyAgLSBkb250SXRlcmF0ZTogYW4gb3B0aW9uYWwgYm9vbDsgaWYgdHJ1ZSwgaXQgbWVhbnMgdGhhdCAndmFsdWUnIGlzIGFuIGFycmF5XG4vLyAgICB0aGF0IGV4cGFuZEFycmF5c0luQnJhbmNoZXMgc2hvdWxkIE5PVCBleHBhbmQuIFRoaXMgc3BlY2lmaWNhbGx5IGhhcHBlbnNcbi8vICAgIHdoZW4gdGhlcmUgaXMgYSBudW1lcmljIGluZGV4IGluIHRoZSBrZXksIGFuZCBlbnN1cmVzIHRoZVxuLy8gICAgcGVyaGFwcy1zdXJwcmlzaW5nIE1vbmdvREIgYmVoYXZpb3Igd2hlcmUgeydhLjAnOiA1fSBkb2VzIE5PVFxuLy8gICAgbWF0Y2gge2E6IFtbNV1dfS5cbi8vICAtIGFycmF5SW5kaWNlczogaWYgYW55IGFycmF5IGluZGV4aW5nIHdhcyBkb25lIGR1cmluZyBsb29rdXAgKGVpdGhlciBkdWUgdG9cbi8vICAgIGV4cGxpY2l0IG51bWVyaWMgaW5kaWNlcyBvciBpbXBsaWNpdCBicmFuY2hpbmcpLCB0aGlzIHdpbGwgYmUgYW4gYXJyYXkgb2Zcbi8vICAgIHRoZSBhcnJheSBpbmRpY2VzIHVzZWQsIGZyb20gb3V0ZXJtb3N0IHRvIGlubmVybW9zdDsgaXQgaXMgZmFsc2V5IG9yXG4vLyAgICBhYnNlbnQgaWYgbm8gYXJyYXkgaW5kZXggaXMgdXNlZC4gSWYgYW4gZXhwbGljaXQgbnVtZXJpYyBpbmRleCBpcyB1c2VkLFxuLy8gICAgdGhlIGluZGV4IHdpbGwgYmUgZm9sbG93ZWQgaW4gYXJyYXlJbmRpY2VzIGJ5IHRoZSBzdHJpbmcgJ3gnLlxuLy9cbi8vICAgIE5vdGU6IGFycmF5SW5kaWNlcyBpcyB1c2VkIGZvciB0d28gcHVycG9zZXMuIEZpcnN0LCBpdCBpcyB1c2VkIHRvXG4vLyAgICBpbXBsZW1lbnQgdGhlICckJyBtb2RpZmllciBmZWF0dXJlLCB3aGljaCBvbmx5IGV2ZXIgbG9va3MgYXQgaXRzIGZpcnN0XG4vLyAgICBlbGVtZW50LlxuLy9cbi8vICAgIFNlY29uZCwgaXQgaXMgdXNlZCBmb3Igc29ydCBrZXkgZ2VuZXJhdGlvbiwgd2hpY2ggbmVlZHMgdG8gYmUgYWJsZSB0byB0ZWxsXG4vLyAgICB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIGRpZmZlcmVudCBwYXRocy4gTW9yZW92ZXIsIGl0IG5lZWRzIHRvXG4vLyAgICBkaWZmZXJlbnRpYXRlIGJldHdlZW4gZXhwbGljaXQgYW5kIGltcGxpY2l0IGJyYW5jaGluZywgd2hpY2ggaXMgd2h5XG4vLyAgICB0aGVyZSdzIHRoZSBzb21ld2hhdCBoYWNreSAneCcgZW50cnk6IHRoaXMgbWVhbnMgdGhhdCBleHBsaWNpdCBhbmRcbi8vICAgIGltcGxpY2l0IGFycmF5IGxvb2t1cHMgd2lsbCBoYXZlIGRpZmZlcmVudCBmdWxsIGFycmF5SW5kaWNlcyBwYXRocy4gKFRoYXRcbi8vICAgIGNvZGUgb25seSByZXF1aXJlcyB0aGF0IGRpZmZlcmVudCBwYXRocyBoYXZlIGRpZmZlcmVudCBhcnJheUluZGljZXM7IGl0XG4vLyAgICBkb2Vzbid0IGFjdHVhbGx5ICdwYXJzZScgYXJyYXlJbmRpY2VzLiBBcyBhbiBhbHRlcm5hdGl2ZSwgYXJyYXlJbmRpY2VzXG4vLyAgICBjb3VsZCBjb250YWluIG9iamVjdHMgd2l0aCBmbGFncyBsaWtlICdpbXBsaWNpdCcsIGJ1dCBJIHRoaW5rIHRoYXQgb25seVxuLy8gICAgbWFrZXMgdGhlIGNvZGUgc3Vycm91bmRpbmcgdGhlbSBtb3JlIGNvbXBsZXguKVxuLy9cbi8vICAgIChCeSB0aGUgd2F5LCB0aGlzIGZpZWxkIGVuZHMgdXAgZ2V0dGluZyBwYXNzZWQgYXJvdW5kIGEgbG90IHdpdGhvdXRcbi8vICAgIGNsb25pbmcsIHNvIG5ldmVyIG11dGF0ZSBhbnkgYXJyYXlJbmRpY2VzIGZpZWxkL3ZhciBpbiB0aGlzIHBhY2thZ2UhKVxuLy9cbi8vXG4vLyBBdCB0aGUgdG9wIGxldmVsLCB5b3UgbWF5IG9ubHkgcGFzcyBpbiBhIHBsYWluIG9iamVjdCBvciBhcnJheS5cbi8vXG4vLyBTZWUgdGhlIHRlc3QgJ21pbmltb25nbyAtIGxvb2t1cCcgZm9yIHNvbWUgZXhhbXBsZXMgb2Ygd2hhdCBsb29rdXAgZnVuY3Rpb25zXG4vLyByZXR1cm4uXG5leHBvcnQgZnVuY3Rpb24gbWFrZUxvb2t1cEZ1bmN0aW9uKGtleSwgb3B0aW9ucyA9IHt9KSB7XG4gIGNvbnN0IHBhcnRzID0ga2V5LnNwbGl0KCcuJyk7XG4gIGNvbnN0IGZpcnN0UGFydCA9IHBhcnRzLmxlbmd0aCA/IHBhcnRzWzBdIDogJyc7XG4gIGNvbnN0IGxvb2t1cFJlc3QgPSAoXG4gICAgcGFydHMubGVuZ3RoID4gMSAmJlxuICAgIG1ha2VMb29rdXBGdW5jdGlvbihwYXJ0cy5zbGljZSgxKS5qb2luKCcuJyksIG9wdGlvbnMpXG4gICk7XG5cbiAgZnVuY3Rpb24gYnVpbGRSZXN1bHQoYXJyYXlJbmRpY2VzLCBkb250SXRlcmF0ZSwgdmFsdWUpIHtcbiAgICByZXR1cm4gYXJyYXlJbmRpY2VzICYmIGFycmF5SW5kaWNlcy5sZW5ndGhcbiAgICAgID8gZG9udEl0ZXJhdGVcbiAgICAgICAgPyBbeyBhcnJheUluZGljZXMsIGRvbnRJdGVyYXRlLCB2YWx1ZSB9XVxuICAgICAgICA6IFt7IGFycmF5SW5kaWNlcywgdmFsdWUgfV1cbiAgICAgIDogZG9udEl0ZXJhdGVcbiAgICAgICAgPyBbeyBkb250SXRlcmF0ZSwgdmFsdWUgfV1cbiAgICAgICAgOiBbeyB2YWx1ZSB9XTtcbiAgfVxuXG4gIC8vIERvYyB3aWxsIGFsd2F5cyBiZSBhIHBsYWluIG9iamVjdCBvciBhbiBhcnJheS5cbiAgLy8gYXBwbHkgYW4gZXhwbGljaXQgbnVtZXJpYyBpbmRleCwgYW4gYXJyYXkuXG4gIHJldHVybiAoZG9jLCBhcnJheUluZGljZXMpID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShkb2MpKSB7XG4gICAgICAvLyBJZiB3ZSdyZSBiZWluZyBhc2tlZCB0byBkbyBhbiBpbnZhbGlkIGxvb2t1cCBpbnRvIGFuIGFycmF5IChub24taW50ZWdlclxuICAgICAgLy8gb3Igb3V0LW9mLWJvdW5kcyksIHJldHVybiBubyByZXN1bHRzICh3aGljaCBpcyBkaWZmZXJlbnQgZnJvbSByZXR1cm5pbmdcbiAgICAgIC8vIGEgc2luZ2xlIHVuZGVmaW5lZCByZXN1bHQsIGluIHRoYXQgYG51bGxgIGVxdWFsaXR5IGNoZWNrcyB3b24ndCBtYXRjaCkuXG4gICAgICBpZiAoIShpc051bWVyaWNLZXkoZmlyc3RQYXJ0KSAmJiBmaXJzdFBhcnQgPCBkb2MubGVuZ3RoKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG5cbiAgICAgIC8vIFJlbWVtYmVyIHRoYXQgd2UgdXNlZCB0aGlzIGFycmF5IGluZGV4LiBJbmNsdWRlIGFuICd4JyB0byBpbmRpY2F0ZSB0aGF0XG4gICAgICAvLyB0aGUgcHJldmlvdXMgaW5kZXggY2FtZSBmcm9tIGJlaW5nIGNvbnNpZGVyZWQgYXMgYW4gZXhwbGljaXQgYXJyYXlcbiAgICAgIC8vIGluZGV4IChub3QgYnJhbmNoaW5nKS5cbiAgICAgIGFycmF5SW5kaWNlcyA9IGFycmF5SW5kaWNlcyA/IGFycmF5SW5kaWNlcy5jb25jYXQoK2ZpcnN0UGFydCwgJ3gnKSA6IFsrZmlyc3RQYXJ0LCAneCddO1xuICAgIH1cblxuICAgIC8vIERvIG91ciBmaXJzdCBsb29rdXAuXG4gICAgY29uc3QgZmlyc3RMZXZlbCA9IGRvY1tmaXJzdFBhcnRdO1xuXG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gZGVlcGVyIHRvIGRpZywgcmV0dXJuIHdoYXQgd2UgZm91bmQuXG4gICAgLy9cbiAgICAvLyBJZiB3aGF0IHdlIGZvdW5kIGlzIGFuIGFycmF5LCBtb3N0IHZhbHVlIHNlbGVjdG9ycyB3aWxsIGNob29zZSB0byB0cmVhdFxuICAgIC8vIHRoZSBlbGVtZW50cyBvZiB0aGUgYXJyYXkgYXMgbWF0Y2hhYmxlIHZhbHVlcyBpbiB0aGVpciBvd24gcmlnaHQsIGJ1dFxuICAgIC8vIHRoYXQncyBkb25lIG91dHNpZGUgb2YgdGhlIGxvb2t1cCBmdW5jdGlvbi4gKEV4Y2VwdGlvbnMgdG8gdGhpcyBhcmUgJHNpemVcbiAgICAvLyBhbmQgc3R1ZmYgcmVsYXRpbmcgdG8gJGVsZW1NYXRjaC4gIGVnLCB7YTogeyRzaXplOiAyfX0gZG9lcyBub3QgbWF0Y2gge2E6XG4gICAgLy8gW1sxLCAyXV19LilcbiAgICAvL1xuICAgIC8vIFRoYXQgc2FpZCwgaWYgd2UganVzdCBkaWQgYW4gKmV4cGxpY2l0KiBhcnJheSBsb29rdXAgKG9uIGRvYykgdG8gZmluZFxuICAgIC8vIGZpcnN0TGV2ZWwsIGFuZCBmaXJzdExldmVsIGlzIGFuIGFycmF5IHRvbywgd2UgZG8gTk9UIHdhbnQgdmFsdWVcbiAgICAvLyBzZWxlY3RvcnMgdG8gaXRlcmF0ZSBvdmVyIGl0LiAgZWcsIHsnYS4wJzogNX0gZG9lcyBub3QgbWF0Y2gge2E6IFtbNV1dfS5cbiAgICAvLyBTbyBpbiB0aGF0IGNhc2UsIHdlIG1hcmsgdGhlIHJldHVybiB2YWx1ZSBhcyAnZG9uJ3QgaXRlcmF0ZScuXG4gICAgaWYgKCFsb29rdXBSZXN0KSB7XG4gICAgICByZXR1cm4gYnVpbGRSZXN1bHQoXG4gICAgICAgIGFycmF5SW5kaWNlcyxcbiAgICAgICAgQXJyYXkuaXNBcnJheShkb2MpICYmIEFycmF5LmlzQXJyYXkoZmlyc3RMZXZlbCksXG4gICAgICAgIGZpcnN0TGV2ZWwsXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFdlIG5lZWQgdG8gZGlnIGRlZXBlci4gIEJ1dCBpZiB3ZSBjYW4ndCwgYmVjYXVzZSB3aGF0IHdlJ3ZlIGZvdW5kIGlzIG5vdFxuICAgIC8vIGFuIGFycmF5IG9yIHBsYWluIG9iamVjdCwgd2UncmUgZG9uZS4gSWYgd2UganVzdCBkaWQgYSBudW1lcmljIGluZGV4IGludG9cbiAgICAvLyBhbiBhcnJheSwgd2UgcmV0dXJuIG5vdGhpbmcgaGVyZSAodGhpcyBpcyBhIGNoYW5nZSBpbiBNb25nbyAyLjUgZnJvbVxuICAgIC8vIE1vbmdvIDIuNCwgd2hlcmUgeydhLjAuYic6IG51bGx9IHN0b3BwZWQgbWF0Y2hpbmcge2E6IFs1XX0pLiBPdGhlcndpc2UsXG4gICAgLy8gcmV0dXJuIGEgc2luZ2xlIGB1bmRlZmluZWRgICh3aGljaCBjYW4sIGZvciBleGFtcGxlLCBtYXRjaCB2aWEgZXF1YWxpdHlcbiAgICAvLyB3aXRoIGBudWxsYCkuXG4gICAgaWYgKCFpc0luZGV4YWJsZShmaXJzdExldmVsKSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZG9jKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBidWlsZFJlc3VsdChhcnJheUluZGljZXMsIGZhbHNlLCB1bmRlZmluZWQpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IFtdO1xuICAgIGNvbnN0IGFwcGVuZFRvUmVzdWx0ID0gbW9yZSA9PiB7XG4gICAgICByZXN1bHQucHVzaCguLi5tb3JlKTtcbiAgICB9O1xuXG4gICAgLy8gRGlnIGRlZXBlcjogbG9vayB1cCB0aGUgcmVzdCBvZiB0aGUgcGFydHMgb24gd2hhdGV2ZXIgd2UndmUgZm91bmQuXG4gICAgLy8gKGxvb2t1cFJlc3QgaXMgc21hcnQgZW5vdWdoIHRvIG5vdCB0cnkgdG8gZG8gaW52YWxpZCBsb29rdXBzIGludG9cbiAgICAvLyBmaXJzdExldmVsIGlmIGl0J3MgYW4gYXJyYXkuKVxuICAgIGFwcGVuZFRvUmVzdWx0KGxvb2t1cFJlc3QoZmlyc3RMZXZlbCwgYXJyYXlJbmRpY2VzKSk7XG5cbiAgICAvLyBJZiB3ZSBmb3VuZCBhbiBhcnJheSwgdGhlbiBpbiAqYWRkaXRpb24qIHRvIHBvdGVudGlhbGx5IHRyZWF0aW5nIHRoZSBuZXh0XG4gICAgLy8gcGFydCBhcyBhIGxpdGVyYWwgaW50ZWdlciBsb29rdXAsIHdlIHNob3VsZCBhbHNvICdicmFuY2gnOiB0cnkgdG8gbG9vayB1cFxuICAgIC8vIHRoZSByZXN0IG9mIHRoZSBwYXJ0cyBvbiBlYWNoIGFycmF5IGVsZW1lbnQgaW4gcGFyYWxsZWwuXG4gICAgLy9cbiAgICAvLyBJbiB0aGlzIGNhc2UsIHdlICpvbmx5KiBkaWcgZGVlcGVyIGludG8gYXJyYXkgZWxlbWVudHMgdGhhdCBhcmUgcGxhaW5cbiAgICAvLyBvYmplY3RzLiAoUmVjYWxsIHRoYXQgd2Ugb25seSBnb3QgdGhpcyBmYXIgaWYgd2UgaGF2ZSBmdXJ0aGVyIHRvIGRpZy4pXG4gICAgLy8gVGhpcyBtYWtlcyBzZW5zZTogd2UgY2VydGFpbmx5IGRvbid0IGRpZyBkZWVwZXIgaW50byBub24taW5kZXhhYmxlXG4gICAgLy8gb2JqZWN0cy4gQW5kIGl0IHdvdWxkIGJlIHdlaXJkIHRvIGRpZyBpbnRvIGFuIGFycmF5OiBpdCdzIHNpbXBsZXIgdG8gaGF2ZVxuICAgIC8vIGEgcnVsZSB0aGF0IGV4cGxpY2l0IGludGVnZXIgaW5kZXhlcyBvbmx5IGFwcGx5IHRvIGFuIG91dGVyIGFycmF5LCBub3QgdG9cbiAgICAvLyBhbiBhcnJheSB5b3UgZmluZCBhZnRlciBhIGJyYW5jaGluZyBzZWFyY2guXG4gICAgLy9cbiAgICAvLyBJbiB0aGUgc3BlY2lhbCBjYXNlIG9mIGEgbnVtZXJpYyBwYXJ0IGluIGEgKnNvcnQgc2VsZWN0b3IqIChub3QgYSBxdWVyeVxuICAgIC8vIHNlbGVjdG9yKSwgd2Ugc2tpcCB0aGUgYnJhbmNoaW5nOiB3ZSBPTkxZIGFsbG93IHRoZSBudW1lcmljIHBhcnQgdG8gbWVhblxuICAgIC8vICdsb29rIHVwIHRoaXMgaW5kZXgnIGluIHRoYXQgY2FzZSwgbm90ICdhbHNvIGxvb2sgdXAgdGhpcyBpbmRleCBpbiBhbGxcbiAgICAvLyB0aGUgZWxlbWVudHMgb2YgdGhlIGFycmF5Jy5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaXJzdExldmVsKSAmJlxuICAgICAgICAhKGlzTnVtZXJpY0tleShwYXJ0c1sxXSkgJiYgb3B0aW9ucy5mb3JTb3J0KSkge1xuICAgICAgZmlyc3RMZXZlbC5mb3JFYWNoKChicmFuY2gsIGFycmF5SW5kZXgpID0+IHtcbiAgICAgICAgaWYgKExvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdChicmFuY2gpKSB7XG4gICAgICAgICAgYXBwZW5kVG9SZXN1bHQobG9va3VwUmVzdChicmFuY2gsIGFycmF5SW5kaWNlcyA/IGFycmF5SW5kaWNlcy5jb25jYXQoYXJyYXlJbmRleCkgOiBbYXJyYXlJbmRleF0pKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcbn1cblxuLy8gT2JqZWN0IGV4cG9ydGVkIG9ubHkgZm9yIHVuaXQgdGVzdGluZy5cbi8vIFVzZSBpdCB0byBleHBvcnQgcHJpdmF0ZSBmdW5jdGlvbnMgdG8gdGVzdCBpbiBUaW55dGVzdC5cbk1pbmltb25nb1Rlc3QgPSB7bWFrZUxvb2t1cEZ1bmN0aW9ufTtcbk1pbmltb25nb0Vycm9yID0gKG1lc3NhZ2UsIG9wdGlvbnMgPSB7fSkgPT4ge1xuICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnICYmIG9wdGlvbnMuZmllbGQpIHtcbiAgICBtZXNzYWdlICs9IGAgZm9yIGZpZWxkICcke29wdGlvbnMuZmllbGR9J2A7XG4gIH1cblxuICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgZXJyb3IubmFtZSA9ICdNaW5pbW9uZ29FcnJvcic7XG4gIHJldHVybiBlcnJvcjtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBub3RoaW5nTWF0Y2hlcihkb2NPckJyYW5jaGVkVmFsdWVzKSB7XG4gIHJldHVybiB7cmVzdWx0OiBmYWxzZX07XG59XG5cbi8vIFRha2VzIGFuIG9wZXJhdG9yIG9iamVjdCAoYW4gb2JqZWN0IHdpdGggJCBrZXlzKSBhbmQgcmV0dXJucyBhIGJyYW5jaGVkXG4vLyBtYXRjaGVyIGZvciBpdC5cbmZ1bmN0aW9uIG9wZXJhdG9yQnJhbmNoZWRNYXRjaGVyKHZhbHVlU2VsZWN0b3IsIG1hdGNoZXIsIGlzUm9vdCkge1xuICAvLyBFYWNoIHZhbHVlU2VsZWN0b3Igd29ya3Mgc2VwYXJhdGVseSBvbiB0aGUgdmFyaW91cyBicmFuY2hlcy4gIFNvIG9uZVxuICAvLyBvcGVyYXRvciBjYW4gbWF0Y2ggb25lIGJyYW5jaCBhbmQgYW5vdGhlciBjYW4gbWF0Y2ggYW5vdGhlciBicmFuY2guICBUaGlzXG4gIC8vIGlzIE9LLlxuICBjb25zdCBvcGVyYXRvck1hdGNoZXJzID0gT2JqZWN0LmtleXModmFsdWVTZWxlY3RvcikubWFwKG9wZXJhdG9yID0+IHtcbiAgICBjb25zdCBvcGVyYW5kID0gdmFsdWVTZWxlY3RvcltvcGVyYXRvcl07XG5cbiAgICBjb25zdCBzaW1wbGVSYW5nZSA9IChcbiAgICAgIFsnJGx0JywgJyRsdGUnLCAnJGd0JywgJyRndGUnXS5pbmNsdWRlcyhvcGVyYXRvcikgJiZcbiAgICAgIHR5cGVvZiBvcGVyYW5kID09PSAnbnVtYmVyJ1xuICAgICk7XG5cbiAgICBjb25zdCBzaW1wbGVFcXVhbGl0eSA9IChcbiAgICAgIFsnJG5lJywgJyRlcSddLmluY2x1ZGVzKG9wZXJhdG9yKSAmJlxuICAgICAgb3BlcmFuZCAhPT0gT2JqZWN0KG9wZXJhbmQpXG4gICAgKTtcblxuICAgIGNvbnN0IHNpbXBsZUluY2x1c2lvbiA9IChcbiAgICAgIFsnJGluJywgJyRuaW4nXS5pbmNsdWRlcyhvcGVyYXRvcilcbiAgICAgICYmIEFycmF5LmlzQXJyYXkob3BlcmFuZClcbiAgICAgICYmICFvcGVyYW5kLnNvbWUoeCA9PiB4ID09PSBPYmplY3QoeCkpXG4gICAgKTtcblxuICAgIGlmICghKHNpbXBsZVJhbmdlIHx8IHNpbXBsZUluY2x1c2lvbiB8fCBzaW1wbGVFcXVhbGl0eSkpIHtcbiAgICAgIG1hdGNoZXIuX2lzU2ltcGxlID0gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKGhhc093bi5jYWxsKFZBTFVFX09QRVJBVE9SUywgb3BlcmF0b3IpKSB7XG4gICAgICByZXR1cm4gVkFMVUVfT1BFUkFUT1JTW29wZXJhdG9yXShvcGVyYW5kLCB2YWx1ZVNlbGVjdG9yLCBtYXRjaGVyLCBpc1Jvb3QpO1xuICAgIH1cblxuICAgIGlmIChoYXNPd24uY2FsbChFTEVNRU5UX09QRVJBVE9SUywgb3BlcmF0b3IpKSB7XG4gICAgICBjb25zdCBvcHRpb25zID0gRUxFTUVOVF9PUEVSQVRPUlNbb3BlcmF0b3JdO1xuICAgICAgcmV0dXJuIGNvbnZlcnRFbGVtZW50TWF0Y2hlclRvQnJhbmNoZWRNYXRjaGVyKFxuICAgICAgICBvcHRpb25zLmNvbXBpbGVFbGVtZW50U2VsZWN0b3Iob3BlcmFuZCwgdmFsdWVTZWxlY3RvciwgbWF0Y2hlciksXG4gICAgICAgIG9wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IEVycm9yKGBVbnJlY29nbml6ZWQgb3BlcmF0b3I6ICR7b3BlcmF0b3J9YCk7XG4gIH0pO1xuXG4gIHJldHVybiBhbmRCcmFuY2hlZE1hdGNoZXJzKG9wZXJhdG9yTWF0Y2hlcnMpO1xufVxuXG4vLyBwYXRocyAtIEFycmF5OiBsaXN0IG9mIG1vbmdvIHN0eWxlIHBhdGhzXG4vLyBuZXdMZWFmRm4gLSBGdW5jdGlvbjogb2YgZm9ybSBmdW5jdGlvbihwYXRoKSBzaG91bGQgcmV0dXJuIGEgc2NhbGFyIHZhbHVlIHRvXG4vLyAgICAgICAgICAgICAgICAgICAgICAgcHV0IGludG8gbGlzdCBjcmVhdGVkIGZvciB0aGF0IHBhdGhcbi8vIGNvbmZsaWN0Rm4gLSBGdW5jdGlvbjogb2YgZm9ybSBmdW5jdGlvbihub2RlLCBwYXRoLCBmdWxsUGF0aCkgaXMgY2FsbGVkXG4vLyAgICAgICAgICAgICAgICAgICAgICAgIHdoZW4gYnVpbGRpbmcgYSB0cmVlIHBhdGggZm9yICdmdWxsUGF0aCcgbm9kZSBvblxuLy8gICAgICAgICAgICAgICAgICAgICAgICAncGF0aCcgd2FzIGFscmVhZHkgYSBsZWFmIHdpdGggYSB2YWx1ZS4gTXVzdCByZXR1cm4gYVxuLy8gICAgICAgICAgICAgICAgICAgICAgICBjb25mbGljdCByZXNvbHV0aW9uLlxuLy8gaW5pdGlhbCB0cmVlIC0gT3B0aW9uYWwgT2JqZWN0OiBzdGFydGluZyB0cmVlLlxuLy8gQHJldHVybnMgLSBPYmplY3Q6IHRyZWUgcmVwcmVzZW50ZWQgYXMgYSBzZXQgb2YgbmVzdGVkIG9iamVjdHNcbmV4cG9ydCBmdW5jdGlvbiBwYXRoc1RvVHJlZShwYXRocywgbmV3TGVhZkZuLCBjb25mbGljdEZuLCByb290ID0ge30pIHtcbiAgcGF0aHMuZm9yRWFjaChwYXRoID0+IHtcbiAgICBjb25zdCBwYXRoQXJyYXkgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgbGV0IHRyZWUgPSByb290O1xuXG4gICAgLy8gdXNlIC5ldmVyeSBqdXN0IGZvciBpdGVyYXRpb24gd2l0aCBicmVha1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSBwYXRoQXJyYXkuc2xpY2UoMCwgLTEpLmV2ZXJ5KChrZXksIGkpID0+IHtcbiAgICAgIGlmICghaGFzT3duLmNhbGwodHJlZSwga2V5KSkge1xuICAgICAgICB0cmVlW2tleV0gPSB7fTtcbiAgICAgIH0gZWxzZSBpZiAodHJlZVtrZXldICE9PSBPYmplY3QodHJlZVtrZXldKSkge1xuICAgICAgICB0cmVlW2tleV0gPSBjb25mbGljdEZuKFxuICAgICAgICAgIHRyZWVba2V5XSxcbiAgICAgICAgICBwYXRoQXJyYXkuc2xpY2UoMCwgaSArIDEpLmpvaW4oJy4nKSxcbiAgICAgICAgICBwYXRoXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gYnJlYWsgb3V0IG9mIGxvb3AgaWYgd2UgYXJlIGZhaWxpbmcgZm9yIHRoaXMgcGF0aFxuICAgICAgICBpZiAodHJlZVtrZXldICE9PSBPYmplY3QodHJlZVtrZXldKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0cmVlID0gdHJlZVtrZXldO1xuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcblxuICAgIGlmIChzdWNjZXNzKSB7XG4gICAgICBjb25zdCBsYXN0S2V5ID0gcGF0aEFycmF5W3BhdGhBcnJheS5sZW5ndGggLSAxXTtcbiAgICAgIGlmIChoYXNPd24uY2FsbCh0cmVlLCBsYXN0S2V5KSkge1xuICAgICAgICB0cmVlW2xhc3RLZXldID0gY29uZmxpY3RGbih0cmVlW2xhc3RLZXldLCBwYXRoLCBwYXRoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyZWVbbGFzdEtleV0gPSBuZXdMZWFmRm4ocGF0aCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gcm9vdDtcbn1cblxuLy8gTWFrZXMgc3VyZSB3ZSBnZXQgMiBlbGVtZW50cyBhcnJheSBhbmQgYXNzdW1lIHRoZSBmaXJzdCBvbmUgdG8gYmUgeCBhbmRcbi8vIHRoZSBzZWNvbmQgb25lIHRvIHkgbm8gbWF0dGVyIHdoYXQgdXNlciBwYXNzZXMuXG4vLyBJbiBjYXNlIHVzZXIgcGFzc2VzIHsgbG9uOiB4LCBsYXQ6IHkgfSByZXR1cm5zIFt4LCB5XVxuZnVuY3Rpb24gcG9pbnRUb0FycmF5KHBvaW50KSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHBvaW50KSA/IHBvaW50LnNsaWNlKCkgOiBbcG9pbnQueCwgcG9pbnQueV07XG59XG5cbi8vIENyZWF0aW5nIGEgZG9jdW1lbnQgZnJvbSBhbiB1cHNlcnQgaXMgcXVpdGUgdHJpY2t5LlxuLy8gRS5nLiB0aGlzIHNlbGVjdG9yOiB7XCIkb3JcIjogW3tcImIuZm9vXCI6IHtcIiRhbGxcIjogW1wiYmFyXCJdfX1dfSwgc2hvdWxkIHJlc3VsdFxuLy8gaW46IHtcImIuZm9vXCI6IFwiYmFyXCJ9XG4vLyBCdXQgdGhpcyBzZWxlY3Rvcjoge1wiJG9yXCI6IFt7XCJiXCI6IHtcImZvb1wiOiB7XCIkYWxsXCI6IFtcImJhclwiXX19fV19IHNob3VsZCB0aHJvd1xuLy8gYW4gZXJyb3JcblxuLy8gU29tZSBydWxlcyAoZm91bmQgbWFpbmx5IHdpdGggdHJpYWwgJiBlcnJvciwgc28gdGhlcmUgbWlnaHQgYmUgbW9yZSk6XG4vLyAtIGhhbmRsZSBhbGwgY2hpbGRzIG9mICRhbmQgKG9yIGltcGxpY2l0ICRhbmQpXG4vLyAtIGhhbmRsZSAkb3Igbm9kZXMgd2l0aCBleGFjdGx5IDEgY2hpbGRcbi8vIC0gaWdub3JlICRvciBub2RlcyB3aXRoIG1vcmUgdGhhbiAxIGNoaWxkXG4vLyAtIGlnbm9yZSAkbm9yIGFuZCAkbm90IG5vZGVzXG4vLyAtIHRocm93IHdoZW4gYSB2YWx1ZSBjYW4gbm90IGJlIHNldCB1bmFtYmlndW91c2x5XG4vLyAtIGV2ZXJ5IHZhbHVlIGZvciAkYWxsIHNob3VsZCBiZSBkZWFsdCB3aXRoIGFzIHNlcGFyYXRlICRlcS1zXG4vLyAtIHRocmVhdCBhbGwgY2hpbGRyZW4gb2YgJGFsbCBhcyAkZXEgc2V0dGVycyAoPT4gc2V0IGlmICRhbGwubGVuZ3RoID09PSAxLFxuLy8gICBvdGhlcndpc2UgdGhyb3cgZXJyb3IpXG4vLyAtIHlvdSBjYW4gbm90IG1peCAnJCctcHJlZml4ZWQga2V5cyBhbmQgbm9uLSckJy1wcmVmaXhlZCBrZXlzXG4vLyAtIHlvdSBjYW4gb25seSBoYXZlIGRvdHRlZCBrZXlzIG9uIGEgcm9vdC1sZXZlbFxuLy8gLSB5b3UgY2FuIG5vdCBoYXZlICckJy1wcmVmaXhlZCBrZXlzIG1vcmUgdGhhbiBvbmUtbGV2ZWwgZGVlcCBpbiBhbiBvYmplY3RcblxuLy8gSGFuZGxlcyBvbmUga2V5L3ZhbHVlIHBhaXIgdG8gcHV0IGluIHRoZSBzZWxlY3RvciBkb2N1bWVudFxuZnVuY3Rpb24gcG9wdWxhdGVEb2N1bWVudFdpdGhLZXlWYWx1ZShkb2N1bWVudCwga2V5LCB2YWx1ZSkge1xuICBpZiAodmFsdWUgJiYgT2JqZWN0LmdldFByb3RvdHlwZU9mKHZhbHVlKSA9PT0gT2JqZWN0LnByb3RvdHlwZSkge1xuICAgIHBvcHVsYXRlRG9jdW1lbnRXaXRoT2JqZWN0KGRvY3VtZW50LCBrZXksIHZhbHVlKTtcbiAgfSBlbHNlIGlmICghKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSkge1xuICAgIGluc2VydEludG9Eb2N1bWVudChkb2N1bWVudCwga2V5LCB2YWx1ZSk7XG4gIH1cbn1cblxuLy8gSGFuZGxlcyBhIGtleSwgdmFsdWUgcGFpciB0byBwdXQgaW4gdGhlIHNlbGVjdG9yIGRvY3VtZW50XG4vLyBpZiB0aGUgdmFsdWUgaXMgYW4gb2JqZWN0XG5mdW5jdGlvbiBwb3B1bGF0ZURvY3VtZW50V2l0aE9iamVjdChkb2N1bWVudCwga2V5LCB2YWx1ZSkge1xuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICBjb25zdCB1bnByZWZpeGVkS2V5cyA9IGtleXMuZmlsdGVyKG9wID0+IG9wWzBdICE9PSAnJCcpO1xuXG4gIGlmICh1bnByZWZpeGVkS2V5cy5sZW5ndGggPiAwIHx8ICFrZXlzLmxlbmd0aCkge1xuICAgIC8vIExpdGVyYWwgKHBvc3NpYmx5IGVtcHR5KSBvYmplY3QgKCBvciBlbXB0eSBvYmplY3QgKVxuICAgIC8vIERvbid0IGFsbG93IG1peGluZyAnJCctcHJlZml4ZWQgd2l0aCBub24tJyQnLXByZWZpeGVkIGZpZWxkc1xuICAgIGlmIChrZXlzLmxlbmd0aCAhPT0gdW5wcmVmaXhlZEtleXMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gb3BlcmF0b3I6ICR7dW5wcmVmaXhlZEtleXNbMF19YCk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVPYmplY3QodmFsdWUsIGtleSk7XG4gICAgaW5zZXJ0SW50b0RvY3VtZW50KGRvY3VtZW50LCBrZXksIHZhbHVlKTtcbiAgfSBlbHNlIHtcbiAgICBPYmplY3Qua2V5cyh2YWx1ZSkuZm9yRWFjaChvcCA9PiB7XG4gICAgICBjb25zdCBvYmplY3QgPSB2YWx1ZVtvcF07XG5cbiAgICAgIGlmIChvcCA9PT0gJyRlcScpIHtcbiAgICAgICAgcG9wdWxhdGVEb2N1bWVudFdpdGhLZXlWYWx1ZShkb2N1bWVudCwga2V5LCBvYmplY3QpO1xuICAgICAgfSBlbHNlIGlmIChvcCA9PT0gJyRhbGwnKSB7XG4gICAgICAgIC8vIGV2ZXJ5IHZhbHVlIGZvciAkYWxsIHNob3VsZCBiZSBkZWFsdCB3aXRoIGFzIHNlcGFyYXRlICRlcS1zXG4gICAgICAgIG9iamVjdC5mb3JFYWNoKGVsZW1lbnQgPT5cbiAgICAgICAgICBwb3B1bGF0ZURvY3VtZW50V2l0aEtleVZhbHVlKGRvY3VtZW50LCBrZXksIGVsZW1lbnQpXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuLy8gRmlsbHMgYSBkb2N1bWVudCB3aXRoIGNlcnRhaW4gZmllbGRzIGZyb20gYW4gdXBzZXJ0IHNlbGVjdG9yXG5leHBvcnQgZnVuY3Rpb24gcG9wdWxhdGVEb2N1bWVudFdpdGhRdWVyeUZpZWxkcyhxdWVyeSwgZG9jdW1lbnQgPSB7fSkge1xuICBpZiAoT2JqZWN0LmdldFByb3RvdHlwZU9mKHF1ZXJ5KSA9PT0gT2JqZWN0LnByb3RvdHlwZSkge1xuICAgIC8vIGhhbmRsZSBpbXBsaWNpdCAkYW5kXG4gICAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gcXVlcnlba2V5XTtcblxuICAgICAgaWYgKGtleSA9PT0gJyRhbmQnKSB7XG4gICAgICAgIC8vIGhhbmRsZSBleHBsaWNpdCAkYW5kXG4gICAgICAgIHZhbHVlLmZvckVhY2goZWxlbWVudCA9PlxuICAgICAgICAgIHBvcHVsYXRlRG9jdW1lbnRXaXRoUXVlcnlGaWVsZHMoZWxlbWVudCwgZG9jdW1lbnQpXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gJyRvcicpIHtcbiAgICAgICAgLy8gaGFuZGxlICRvciBub2RlcyB3aXRoIGV4YWN0bHkgMSBjaGlsZFxuICAgICAgICBpZiAodmFsdWUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgcG9wdWxhdGVEb2N1bWVudFdpdGhRdWVyeUZpZWxkcyh2YWx1ZVswXSwgZG9jdW1lbnQpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGtleVswXSAhPT0gJyQnKSB7XG4gICAgICAgIC8vIElnbm9yZSBvdGhlciAnJCctcHJlZml4ZWQgbG9naWNhbCBzZWxlY3RvcnNcbiAgICAgICAgcG9wdWxhdGVEb2N1bWVudFdpdGhLZXlWYWx1ZShkb2N1bWVudCwga2V5LCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gSGFuZGxlIG1ldGVvci1zcGVjaWZpYyBzaG9ydGN1dCBmb3Igc2VsZWN0aW5nIF9pZFxuICAgIGlmIChMb2NhbENvbGxlY3Rpb24uX3NlbGVjdG9ySXNJZChxdWVyeSkpIHtcbiAgICAgIGluc2VydEludG9Eb2N1bWVudChkb2N1bWVudCwgJ19pZCcsIHF1ZXJ5KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZG9jdW1lbnQ7XG59XG5cbi8vIFRyYXZlcnNlcyB0aGUga2V5cyBvZiBwYXNzZWQgcHJvamVjdGlvbiBhbmQgY29uc3RydWN0cyBhIHRyZWUgd2hlcmUgYWxsXG4vLyBsZWF2ZXMgYXJlIGVpdGhlciBhbGwgVHJ1ZSBvciBhbGwgRmFsc2Vcbi8vIEByZXR1cm5zIE9iamVjdDpcbi8vICAtIHRyZWUgLSBPYmplY3QgLSB0cmVlIHJlcHJlc2VudGF0aW9uIG9mIGtleXMgaW52b2x2ZWQgaW4gcHJvamVjdGlvblxuLy8gIChleGNlcHRpb24gZm9yICdfaWQnIGFzIGl0IGlzIGEgc3BlY2lhbCBjYXNlIGhhbmRsZWQgc2VwYXJhdGVseSlcbi8vICAtIGluY2x1ZGluZyAtIEJvb2xlYW4gLSBcInRha2Ugb25seSBjZXJ0YWluIGZpZWxkc1wiIHR5cGUgb2YgcHJvamVjdGlvblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3Rpb25EZXRhaWxzKGZpZWxkcykge1xuICAvLyBGaW5kIHRoZSBub24tX2lkIGtleXMgKF9pZCBpcyBoYW5kbGVkIHNwZWNpYWxseSBiZWNhdXNlIGl0IGlzIGluY2x1ZGVkXG4gIC8vIHVubGVzcyBleHBsaWNpdGx5IGV4Y2x1ZGVkKS4gU29ydCB0aGUga2V5cywgc28gdGhhdCBvdXIgY29kZSB0byBkZXRlY3RcbiAgLy8gb3ZlcmxhcHMgbGlrZSAnZm9vJyBhbmQgJ2Zvby5iYXInIGNhbiBhc3N1bWUgdGhhdCAnZm9vJyBjb21lcyBmaXJzdC5cbiAgbGV0IGZpZWxkc0tleXMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLnNvcnQoKTtcblxuICAvLyBJZiBfaWQgaXMgdGhlIG9ubHkgZmllbGQgaW4gdGhlIHByb2plY3Rpb24sIGRvIG5vdCByZW1vdmUgaXQsIHNpbmNlIGl0IGlzXG4gIC8vIHJlcXVpcmVkIHRvIGRldGVybWluZSBpZiB0aGlzIGlzIGFuIGV4Y2x1c2lvbiBvciBleGNsdXNpb24uIEFsc28ga2VlcCBhblxuICAvLyBpbmNsdXNpdmUgX2lkLCBzaW5jZSBpbmNsdXNpdmUgX2lkIGZvbGxvd3MgdGhlIG5vcm1hbCBydWxlcyBhYm91dCBtaXhpbmdcbiAgLy8gaW5jbHVzaXZlIGFuZCBleGNsdXNpdmUgZmllbGRzLiBJZiBfaWQgaXMgbm90IHRoZSBvbmx5IGZpZWxkIGluIHRoZVxuICAvLyBwcm9qZWN0aW9uIGFuZCBpcyBleGNsdXNpdmUsIHJlbW92ZSBpdCBzbyBpdCBjYW4gYmUgaGFuZGxlZCBsYXRlciBieSBhXG4gIC8vIHNwZWNpYWwgY2FzZSwgc2luY2UgZXhjbHVzaXZlIF9pZCBpcyBhbHdheXMgYWxsb3dlZC5cbiAgaWYgKCEoZmllbGRzS2V5cy5sZW5ndGggPT09IDEgJiYgZmllbGRzS2V5c1swXSA9PT0gJ19pZCcpICYmXG4gICAgICAhKGZpZWxkc0tleXMuaW5jbHVkZXMoJ19pZCcpICYmIGZpZWxkcy5faWQpKSB7XG4gICAgZmllbGRzS2V5cyA9IGZpZWxkc0tleXMuZmlsdGVyKGtleSA9PiBrZXkgIT09ICdfaWQnKTtcbiAgfVxuXG4gIGxldCBpbmNsdWRpbmcgPSBudWxsOyAvLyBVbmtub3duXG5cbiAgZmllbGRzS2V5cy5mb3JFYWNoKGtleVBhdGggPT4ge1xuICAgIGNvbnN0IHJ1bGUgPSAhIWZpZWxkc1trZXlQYXRoXTtcblxuICAgIGlmIChpbmNsdWRpbmcgPT09IG51bGwpIHtcbiAgICAgIGluY2x1ZGluZyA9IHJ1bGU7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBlcnJvciBtZXNzYWdlIGlzIGNvcGllZCBmcm9tIE1vbmdvREIgc2hlbGxcbiAgICBpZiAoaW5jbHVkaW5nICE9PSBydWxlKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgJ1lvdSBjYW5ub3QgY3VycmVudGx5IG1peCBpbmNsdWRpbmcgYW5kIGV4Y2x1ZGluZyBmaWVsZHMuJ1xuICAgICAgKTtcbiAgICB9XG4gIH0pO1xuXG4gIGNvbnN0IHByb2plY3Rpb25SdWxlc1RyZWUgPSBwYXRoc1RvVHJlZShcbiAgICBmaWVsZHNLZXlzLFxuICAgIHBhdGggPT4gaW5jbHVkaW5nLFxuICAgIChub2RlLCBwYXRoLCBmdWxsUGF0aCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgcGFzc2VkIHByb2plY3Rpb24gZmllbGRzJyBrZXlzOiBJZiB5b3UgaGF2ZSB0d28gcnVsZXMgc3VjaCBhc1xuICAgICAgLy8gJ2Zvby5iYXInIGFuZCAnZm9vLmJhci5iYXonLCB0aGVuIHRoZSByZXN1bHQgYmVjb21lcyBhbWJpZ3VvdXMuIElmXG4gICAgICAvLyB0aGF0IGhhcHBlbnMsIHRoZXJlIGlzIGEgcHJvYmFiaWxpdHkgeW91IGFyZSBkb2luZyBzb21ldGhpbmcgd3JvbmcsXG4gICAgICAvLyBmcmFtZXdvcmsgc2hvdWxkIG5vdGlmeSB5b3UgYWJvdXQgc3VjaCBtaXN0YWtlIGVhcmxpZXIgb24gY3Vyc29yXG4gICAgICAvLyBjb21waWxhdGlvbiBzdGVwIHRoYW4gbGF0ZXIgZHVyaW5nIHJ1bnRpbWUuICBOb3RlLCB0aGF0IHJlYWwgbW9uZ29cbiAgICAgIC8vIGRvZXNuJ3QgZG8gYW55dGhpbmcgYWJvdXQgaXQgYW5kIHRoZSBsYXRlciBydWxlIGFwcGVhcnMgaW4gcHJvamVjdGlvblxuICAgICAgLy8gcHJvamVjdCwgbW9yZSBwcmlvcml0eSBpdCB0YWtlcy5cbiAgICAgIC8vXG4gICAgICAvLyBFeGFtcGxlLCBhc3N1bWUgZm9sbG93aW5nIGluIG1vbmdvIHNoZWxsOlxuICAgICAgLy8gPiBkYi5jb2xsLmluc2VydCh7IGE6IHsgYjogMjMsIGM6IDQ0IH0gfSlcbiAgICAgIC8vID4gZGIuY29sbC5maW5kKHt9LCB7ICdhJzogMSwgJ2EuYic6IDEgfSlcbiAgICAgIC8vIHtcIl9pZFwiOiBPYmplY3RJZChcIjUyMGJmZTQ1NjAyNDYwOGU4ZWYyNGFmM1wiKSwgXCJhXCI6IHtcImJcIjogMjN9fVxuICAgICAgLy8gPiBkYi5jb2xsLmZpbmQoe30sIHsgJ2EuYic6IDEsICdhJzogMSB9KVxuICAgICAgLy8ge1wiX2lkXCI6IE9iamVjdElkKFwiNTIwYmZlNDU2MDI0NjA4ZThlZjI0YWYzXCIpLCBcImFcIjoge1wiYlwiOiAyMywgXCJjXCI6IDQ0fX1cbiAgICAgIC8vXG4gICAgICAvLyBOb3RlLCBob3cgc2Vjb25kIHRpbWUgdGhlIHJldHVybiBzZXQgb2Yga2V5cyBpcyBkaWZmZXJlbnQuXG4gICAgICBjb25zdCBjdXJyZW50UGF0aCA9IGZ1bGxQYXRoO1xuICAgICAgY29uc3QgYW5vdGhlclBhdGggPSBwYXRoO1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgIGBib3RoICR7Y3VycmVudFBhdGh9IGFuZCAke2Fub3RoZXJQYXRofSBmb3VuZCBpbiBmaWVsZHMgb3B0aW9uLCBgICtcbiAgICAgICAgJ3VzaW5nIGJvdGggb2YgdGhlbSBtYXkgdHJpZ2dlciB1bmV4cGVjdGVkIGJlaGF2aW9yLiBEaWQgeW91IG1lYW4gdG8gJyArXG4gICAgICAgICd1c2Ugb25seSBvbmUgb2YgdGhlbT8nXG4gICAgICApO1xuICAgIH0pO1xuXG4gIHJldHVybiB7aW5jbHVkaW5nLCB0cmVlOiBwcm9qZWN0aW9uUnVsZXNUcmVlfTtcbn1cblxuLy8gVGFrZXMgYSBSZWdFeHAgb2JqZWN0IGFuZCByZXR1cm5zIGFuIGVsZW1lbnQgbWF0Y2hlci5cbmV4cG9ydCBmdW5jdGlvbiByZWdleHBFbGVtZW50TWF0Y2hlcihyZWdleHApIHtcbiAgcmV0dXJuIHZhbHVlID0+IHtcbiAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgIHJldHVybiB2YWx1ZS50b1N0cmluZygpID09PSByZWdleHAudG9TdHJpbmcoKTtcbiAgICB9XG5cbiAgICAvLyBSZWdleHBzIG9ubHkgd29yayBhZ2FpbnN0IHN0cmluZ3MuXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBSZXNldCByZWdleHAncyBzdGF0ZSB0byBhdm9pZCBpbmNvbnNpc3RlbnQgbWF0Y2hpbmcgZm9yIG9iamVjdHMgd2l0aCB0aGVcbiAgICAvLyBzYW1lIHZhbHVlIG9uIGNvbnNlY3V0aXZlIGNhbGxzIG9mIHJlZ2V4cC50ZXN0LiBUaGlzIGhhcHBlbnMgb25seSBpZiB0aGVcbiAgICAvLyByZWdleHAgaGFzIHRoZSAnZycgZmxhZy4gQWxzbyBub3RlIHRoYXQgRVM2IGludHJvZHVjZXMgYSBuZXcgZmxhZyAneScgZm9yXG4gICAgLy8gd2hpY2ggd2Ugc2hvdWxkICpub3QqIGNoYW5nZSB0aGUgbGFzdEluZGV4IGJ1dCBNb25nb0RCIGRvZXNuJ3Qgc3VwcG9ydFxuICAgIC8vIGVpdGhlciBvZiB0aGVzZSBmbGFncy5cbiAgICByZWdleHAubGFzdEluZGV4ID0gMDtcblxuICAgIHJldHVybiByZWdleHAudGVzdCh2YWx1ZSk7XG4gIH07XG59XG5cbi8vIFZhbGlkYXRlcyB0aGUga2V5IGluIGEgcGF0aC5cbi8vIE9iamVjdHMgdGhhdCBhcmUgbmVzdGVkIG1vcmUgdGhlbiAxIGxldmVsIGNhbm5vdCBoYXZlIGRvdHRlZCBmaWVsZHNcbi8vIG9yIGZpZWxkcyBzdGFydGluZyB3aXRoICckJ1xuZnVuY3Rpb24gdmFsaWRhdGVLZXlJblBhdGgoa2V5LCBwYXRoKSB7XG4gIGlmIChrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBUaGUgZG90dGVkIGZpZWxkICcke2tleX0nIGluICcke3BhdGh9LiR7a2V5fSBpcyBub3QgdmFsaWQgZm9yIHN0b3JhZ2UuYFxuICAgICk7XG4gIH1cblxuICBpZiAoa2V5WzBdID09PSAnJCcpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgVGhlIGRvbGxhciAoJCkgcHJlZml4ZWQgZmllbGQgICcke3BhdGh9LiR7a2V5fSBpcyBub3QgdmFsaWQgZm9yIHN0b3JhZ2UuYFxuICAgICk7XG4gIH1cbn1cblxuLy8gUmVjdXJzaXZlbHkgdmFsaWRhdGVzIGFuIG9iamVjdCB0aGF0IGlzIG5lc3RlZCBtb3JlIHRoYW4gb25lIGxldmVsIGRlZXBcbmZ1bmN0aW9uIHZhbGlkYXRlT2JqZWN0KG9iamVjdCwgcGF0aCkge1xuICBpZiAob2JqZWN0ICYmIE9iamVjdC5nZXRQcm90b3R5cGVPZihvYmplY3QpID09PSBPYmplY3QucHJvdG90eXBlKSB7XG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICB2YWxpZGF0ZUtleUluUGF0aChrZXksIHBhdGgpO1xuICAgICAgdmFsaWRhdGVPYmplY3Qob2JqZWN0W2tleV0sIHBhdGggKyAnLicgKyBrZXkpO1xuICAgIH0pO1xuICB9XG59XG4iLCIvKiogRXhwb3J0ZWQgdmFsdWVzIGFyZSBhbHNvIHVzZWQgaW4gdGhlIG1vbmdvIHBhY2thZ2UuICovXG5cbi8qKiBAcGFyYW0ge3N0cmluZ30gbWV0aG9kICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXN5bmNNZXRob2ROYW1lKG1ldGhvZCkge1xuICByZXR1cm4gYCR7bWV0aG9kLnJlcGxhY2UoJ18nLCAnJyl9QXN5bmNgO1xufVxuXG5leHBvcnQgY29uc3QgQVNZTkNfQ09MTEVDVElPTl9NRVRIT0RTID0gW1xuICAnX2NyZWF0ZUNhcHBlZENvbGxlY3Rpb24nLFxuICAnX2Ryb3BDb2xsZWN0aW9uJyxcbiAgJ19kcm9wSW5kZXgnLFxuICAnY3JlYXRlSW5kZXgnLFxuICAnZmluZE9uZScsXG4gICdpbnNlcnQnLFxuICAncmVtb3ZlJyxcbiAgJ3VwZGF0ZScsXG4gICd1cHNlcnQnLFxuXTtcblxuZXhwb3J0IGNvbnN0IEFTWU5DX0NVUlNPUl9NRVRIT0RTID0gWydjb3VudCcsICdmZXRjaCcsICdmb3JFYWNoJywgJ21hcCddO1xuIiwiaW1wb3J0IExvY2FsQ29sbGVjdGlvbiBmcm9tICcuL2xvY2FsX2NvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgaGFzT3duIH0gZnJvbSAnLi9jb21tb24uanMnO1xuaW1wb3J0IHsgQVNZTkNfQ1VSU09SX01FVEhPRFMsIGdldEFzeW5jTWV0aG9kTmFtZSB9IGZyb20gXCIuL2NvbnN0YW50c1wiO1xuXG4vLyBDdXJzb3I6IGEgc3BlY2lmaWNhdGlvbiBmb3IgYSBwYXJ0aWN1bGFyIHN1YnNldCBvZiBkb2N1bWVudHMsIHcvIGEgZGVmaW5lZFxuLy8gb3JkZXIsIGxpbWl0LCBhbmQgb2Zmc2V0LiAgY3JlYXRpbmcgYSBDdXJzb3Igd2l0aCBMb2NhbENvbGxlY3Rpb24uZmluZCgpLFxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQ3Vyc29yIHtcbiAgLy8gZG9uJ3QgY2FsbCB0aGlzIGN0b3IgZGlyZWN0bHkuICB1c2UgTG9jYWxDb2xsZWN0aW9uLmZpbmQoKS5cbiAgY29uc3RydWN0b3IoY29sbGVjdGlvbiwgc2VsZWN0b3IsIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMuY29sbGVjdGlvbiA9IGNvbGxlY3Rpb247XG4gICAgdGhpcy5zb3J0ZXIgPSBudWxsO1xuICAgIHRoaXMubWF0Y2hlciA9IG5ldyBNaW5pbW9uZ28uTWF0Y2hlcihzZWxlY3Rvcik7XG5cbiAgICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWRQZXJoYXBzQXNPYmplY3Qoc2VsZWN0b3IpKSB7XG4gICAgICAvLyBzdGFzaCBmb3IgZmFzdCBfaWQgYW5kIHsgX2lkIH1cbiAgICAgIHRoaXMuX3NlbGVjdG9ySWQgPSBoYXNPd24uY2FsbChzZWxlY3RvciwgJ19pZCcpXG4gICAgICAgID8gc2VsZWN0b3IuX2lkXG4gICAgICAgIDogc2VsZWN0b3I7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3NlbGVjdG9ySWQgPSB1bmRlZmluZWQ7XG5cbiAgICAgIGlmICh0aGlzLm1hdGNoZXIuaGFzR2VvUXVlcnkoKSB8fCBvcHRpb25zLnNvcnQpIHtcbiAgICAgICAgdGhpcy5zb3J0ZXIgPSBuZXcgTWluaW1vbmdvLlNvcnRlcihvcHRpb25zLnNvcnQgfHwgW10pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuc2tpcCA9IG9wdGlvbnMuc2tpcCB8fCAwO1xuICAgIHRoaXMubGltaXQgPSBvcHRpb25zLmxpbWl0O1xuICAgIHRoaXMuZmllbGRzID0gb3B0aW9ucy5wcm9qZWN0aW9uIHx8IG9wdGlvbnMuZmllbGRzO1xuXG4gICAgdGhpcy5fcHJvamVjdGlvbkZuID0gTG9jYWxDb2xsZWN0aW9uLl9jb21waWxlUHJvamVjdGlvbih0aGlzLmZpZWxkcyB8fCB7fSk7XG5cbiAgICB0aGlzLl90cmFuc2Zvcm0gPSBMb2NhbENvbGxlY3Rpb24ud3JhcFRyYW5zZm9ybShvcHRpb25zLnRyYW5zZm9ybSk7XG5cbiAgICAvLyBieSBkZWZhdWx0LCBxdWVyaWVzIHJlZ2lzdGVyIHcvIFRyYWNrZXIgd2hlbiBpdCBpcyBhdmFpbGFibGUuXG4gICAgaWYgKHR5cGVvZiBUcmFja2VyICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhpcy5yZWFjdGl2ZSA9IG9wdGlvbnMucmVhY3RpdmUgPT09IHVuZGVmaW5lZCA/IHRydWUgOiBvcHRpb25zLnJlYWN0aXZlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAZGVwcmVjYXRlZCBpbiAyLjlcbiAgICogQHN1bW1hcnkgUmV0dXJucyB0aGUgbnVtYmVyIG9mIGRvY3VtZW50cyB0aGF0IG1hdGNoIGEgcXVlcnkuIFRoaXMgbWV0aG9kIGlzXG4gICAqICAgICAgICAgIFtkZXByZWNhdGVkIHNpbmNlIE1vbmdvREIgNC4wXShodHRwczovL3d3dy5tb25nb2RiLmNvbS9kb2NzL3Y0LjQvcmVmZXJlbmNlL2NvbW1hbmQvY291bnQvKTtcbiAgICogICAgICAgICAgc2VlIGBDb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzYCBhbmRcbiAgICogICAgICAgICAgYENvbGxlY3Rpb24uZXN0aW1hdGVkRG9jdW1lbnRDb3VudGAgZm9yIGEgcmVwbGFjZW1lbnQuXG4gICAqIEBtZW1iZXJPZiBNb25nby5DdXJzb3JcbiAgICogQG1ldGhvZCAgY291bnRcbiAgICogQGluc3RhbmNlXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKi9cbiAgY291bnQoKSB7XG4gICAgaWYgKHRoaXMucmVhY3RpdmUpIHtcbiAgICAgIC8vIGFsbG93IHRoZSBvYnNlcnZlIHRvIGJlIHVub3JkZXJlZFxuICAgICAgdGhpcy5fZGVwZW5kKHthZGRlZDogdHJ1ZSwgcmVtb3ZlZDogdHJ1ZX0sIHRydWUpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9nZXRSYXdPYmplY3RzKHtcbiAgICAgIG9yZGVyZWQ6IHRydWUsXG4gICAgfSkubGVuZ3RoO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFJldHVybiBhbGwgbWF0Y2hpbmcgZG9jdW1lbnRzIGFzIGFuIEFycmF5LlxuICAgKiBAbWVtYmVyT2YgTW9uZ28uQ3Vyc29yXG4gICAqIEBtZXRob2QgIGZldGNoXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHJldHVybnMge09iamVjdFtdfVxuICAgKi9cbiAgZmV0Y2goKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gW107XG5cbiAgICB0aGlzLmZvckVhY2goZG9jID0+IHtcbiAgICAgIHJlc3VsdC5wdXNoKGRvYyk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG4gICAgaWYgKHRoaXMucmVhY3RpdmUpIHtcbiAgICAgIHRoaXMuX2RlcGVuZCh7XG4gICAgICAgIGFkZGVkQmVmb3JlOiB0cnVlLFxuICAgICAgICByZW1vdmVkOiB0cnVlLFxuICAgICAgICBjaGFuZ2VkOiB0cnVlLFxuICAgICAgICBtb3ZlZEJlZm9yZTogdHJ1ZX0pO1xuICAgIH1cblxuICAgIGxldCBpbmRleCA9IDA7XG4gICAgY29uc3Qgb2JqZWN0cyA9IHRoaXMuX2dldFJhd09iamVjdHMoe29yZGVyZWQ6IHRydWV9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBuZXh0OiAoKSA9PiB7XG4gICAgICAgIGlmIChpbmRleCA8IG9iamVjdHMubGVuZ3RoKSB7XG4gICAgICAgICAgLy8gVGhpcyBkb3VibGVzIGFzIGEgY2xvbmUgb3BlcmF0aW9uLlxuICAgICAgICAgIGxldCBlbGVtZW50ID0gdGhpcy5fcHJvamVjdGlvbkZuKG9iamVjdHNbaW5kZXgrK10pO1xuXG4gICAgICAgICAgaWYgKHRoaXMuX3RyYW5zZm9ybSlcbiAgICAgICAgICAgIGVsZW1lbnQgPSB0aGlzLl90cmFuc2Zvcm0oZWxlbWVudCk7XG5cbiAgICAgICAgICByZXR1cm4ge3ZhbHVlOiBlbGVtZW50fTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7ZG9uZTogdHJ1ZX07XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIFtTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKSB7XG4gICAgY29uc3Qgc3luY1Jlc3VsdCA9IHRoaXNbU3ltYm9sLml0ZXJhdG9yXSgpO1xuICAgIHJldHVybiB7XG4gICAgICBhc3luYyBuZXh0KCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN5bmNSZXN1bHQubmV4dCgpKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEBjYWxsYmFjayBJdGVyYXRpb25DYWxsYmFja1xuICAgKiBAcGFyYW0ge09iamVjdH0gZG9jXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBpbmRleFxuICAgKi9cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IENhbGwgYGNhbGxiYWNrYCBvbmNlIGZvciBlYWNoIG1hdGNoaW5nIGRvY3VtZW50LCBzZXF1ZW50aWFsbHkgYW5kXG4gICAqICAgICAgICAgIHN5bmNocm9ub3VzbHkuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWV0aG9kICBmb3JFYWNoXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAbWVtYmVyT2YgTW9uZ28uQ3Vyc29yXG4gICAqIEBwYXJhbSB7SXRlcmF0aW9uQ2FsbGJhY2t9IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGNhbGwuIEl0IHdpbGwgYmUgY2FsbGVkXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpdGggdGhyZWUgYXJndW1lbnRzOiB0aGUgZG9jdW1lbnQsIGFcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC1iYXNlZCBpbmRleCwgYW5kIDxlbT5jdXJzb3I8L2VtPlxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdHNlbGYuXG4gICAqIEBwYXJhbSB7QW55fSBbdGhpc0FyZ10gQW4gb2JqZWN0IHdoaWNoIHdpbGwgYmUgdGhlIHZhbHVlIG9mIGB0aGlzYCBpbnNpZGVcbiAgICogICAgICAgICAgICAgICAgICAgICAgICBgY2FsbGJhY2tgLlxuICAgKi9cbiAgZm9yRWFjaChjYWxsYmFjaywgdGhpc0FyZykge1xuICAgIGlmICh0aGlzLnJlYWN0aXZlKSB7XG4gICAgICB0aGlzLl9kZXBlbmQoe1xuICAgICAgICBhZGRlZEJlZm9yZTogdHJ1ZSxcbiAgICAgICAgcmVtb3ZlZDogdHJ1ZSxcbiAgICAgICAgY2hhbmdlZDogdHJ1ZSxcbiAgICAgICAgbW92ZWRCZWZvcmU6IHRydWV9KTtcbiAgICB9XG5cbiAgICB0aGlzLl9nZXRSYXdPYmplY3RzKHtvcmRlcmVkOiB0cnVlfSkuZm9yRWFjaCgoZWxlbWVudCwgaSkgPT4ge1xuICAgICAgLy8gVGhpcyBkb3VibGVzIGFzIGEgY2xvbmUgb3BlcmF0aW9uLlxuICAgICAgZWxlbWVudCA9IHRoaXMuX3Byb2plY3Rpb25GbihlbGVtZW50KTtcblxuICAgICAgaWYgKHRoaXMuX3RyYW5zZm9ybSkge1xuICAgICAgICBlbGVtZW50ID0gdGhpcy5fdHJhbnNmb3JtKGVsZW1lbnQpO1xuICAgICAgfVxuXG4gICAgICBjYWxsYmFjay5jYWxsKHRoaXNBcmcsIGVsZW1lbnQsIGksIHRoaXMpO1xuICAgIH0pO1xuICB9XG5cbiAgZ2V0VHJhbnNmb3JtKCkge1xuICAgIHJldHVybiB0aGlzLl90cmFuc2Zvcm07XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgTWFwIGNhbGxiYWNrIG92ZXIgYWxsIG1hdGNoaW5nIGRvY3VtZW50cy4gIFJldHVybnMgYW4gQXJyYXkuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWV0aG9kIG1hcFxuICAgKiBAaW5zdGFuY2VcbiAgICogQG1lbWJlck9mIE1vbmdvLkN1cnNvclxuICAgKiBAcGFyYW0ge0l0ZXJhdGlvbkNhbGxiYWNrfSBjYWxsYmFjayBGdW5jdGlvbiB0byBjYWxsLiBJdCB3aWxsIGJlIGNhbGxlZFxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aXRoIHRocmVlIGFyZ3VtZW50czogdGhlIGRvY3VtZW50LCBhXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAtYmFzZWQgaW5kZXgsIGFuZCA8ZW0+Y3Vyc29yPC9lbT5cbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRzZWxmLlxuICAgKiBAcGFyYW0ge0FueX0gW3RoaXNBcmddIEFuIG9iamVjdCB3aGljaCB3aWxsIGJlIHRoZSB2YWx1ZSBvZiBgdGhpc2AgaW5zaWRlXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgYGNhbGxiYWNrYC5cbiAgICovXG4gIG1hcChjYWxsYmFjaywgdGhpc0FyZykge1xuICAgIGNvbnN0IHJlc3VsdCA9IFtdO1xuXG4gICAgdGhpcy5mb3JFYWNoKChkb2MsIGkpID0+IHtcbiAgICAgIHJlc3VsdC5wdXNoKGNhbGxiYWNrLmNhbGwodGhpc0FyZywgZG9jLCBpLCB0aGlzKSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gb3B0aW9ucyB0byBjb250YWluOlxuICAvLyAgKiBjYWxsYmFja3MgZm9yIG9ic2VydmUoKTpcbiAgLy8gICAgLSBhZGRlZEF0IChkb2N1bWVudCwgYXRJbmRleClcbiAgLy8gICAgLSBhZGRlZCAoZG9jdW1lbnQpXG4gIC8vICAgIC0gY2hhbmdlZEF0IChuZXdEb2N1bWVudCwgb2xkRG9jdW1lbnQsIGF0SW5kZXgpXG4gIC8vICAgIC0gY2hhbmdlZCAobmV3RG9jdW1lbnQsIG9sZERvY3VtZW50KVxuICAvLyAgICAtIHJlbW92ZWRBdCAoZG9jdW1lbnQsIGF0SW5kZXgpXG4gIC8vICAgIC0gcmVtb3ZlZCAoZG9jdW1lbnQpXG4gIC8vICAgIC0gbW92ZWRUbyAoZG9jdW1lbnQsIG9sZEluZGV4LCBuZXdJbmRleClcbiAgLy9cbiAgLy8gYXR0cmlidXRlcyBhdmFpbGFibGUgb24gcmV0dXJuZWQgcXVlcnkgaGFuZGxlOlxuICAvLyAgKiBzdG9wKCk6IGVuZCB1cGRhdGVzXG4gIC8vICAqIGNvbGxlY3Rpb246IHRoZSBjb2xsZWN0aW9uIHRoaXMgcXVlcnkgaXMgcXVlcnlpbmdcbiAgLy9cbiAgLy8gaWZmIHggaXMgYSByZXR1cm5lZCBxdWVyeSBoYW5kbGUsICh4IGluc3RhbmNlb2ZcbiAgLy8gTG9jYWxDb2xsZWN0aW9uLk9ic2VydmVIYW5kbGUpIGlzIHRydWVcbiAgLy9cbiAgLy8gaW5pdGlhbCByZXN1bHRzIGRlbGl2ZXJlZCB0aHJvdWdoIGFkZGVkIGNhbGxiYWNrXG4gIC8vIFhYWCBtYXliZSBjYWxsYmFja3Mgc2hvdWxkIHRha2UgYSBsaXN0IG9mIG9iamVjdHMsIHRvIGV4cG9zZSB0cmFuc2FjdGlvbnM/XG4gIC8vIFhYWCBtYXliZSBzdXBwb3J0IGZpZWxkIGxpbWl0aW5nICh0byBsaW1pdCB3aGF0IHlvdSdyZSBub3RpZmllZCBvbilcblxuICAvKipcbiAgICogQHN1bW1hcnkgV2F0Y2ggYSBxdWVyeS4gIFJlY2VpdmUgY2FsbGJhY2tzIGFzIHRoZSByZXN1bHQgc2V0IGNoYW5nZXMuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWVtYmVyT2YgTW9uZ28uQ3Vyc29yXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gY2FsbGJhY2tzIEZ1bmN0aW9ucyB0byBjYWxsIHRvIGRlbGl2ZXIgdGhlIHJlc3VsdCBzZXQgYXMgaXRcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFuZ2VzXG4gICAqL1xuICBvYnNlcnZlKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gTG9jYWxDb2xsZWN0aW9uLl9vYnNlcnZlRnJvbU9ic2VydmVDaGFuZ2VzKHRoaXMsIG9wdGlvbnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFdhdGNoIGEgcXVlcnkuIFJlY2VpdmUgY2FsbGJhY2tzIGFzIHRoZSByZXN1bHQgc2V0IGNoYW5nZXMuIE9ubHlcbiAgICogICAgICAgICAgdGhlIGRpZmZlcmVuY2VzIGJldHdlZW4gdGhlIG9sZCBhbmQgbmV3IGRvY3VtZW50cyBhcmUgcGFzc2VkIHRvXG4gICAqICAgICAgICAgIHRoZSBjYWxsYmFja3MuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWVtYmVyT2YgTW9uZ28uQ3Vyc29yXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gY2FsbGJhY2tzIEZ1bmN0aW9ucyB0byBjYWxsIHRvIGRlbGl2ZXIgdGhlIHJlc3VsdCBzZXQgYXMgaXRcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFuZ2VzXG4gICAqL1xuICBvYnNlcnZlQ2hhbmdlcyhvcHRpb25zKSB7XG4gICAgY29uc3Qgb3JkZXJlZCA9IExvY2FsQ29sbGVjdGlvbi5fb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3NBcmVPcmRlcmVkKG9wdGlvbnMpO1xuXG4gICAgLy8gdGhlcmUgYXJlIHNldmVyYWwgcGxhY2VzIHRoYXQgYXNzdW1lIHlvdSBhcmVuJ3QgY29tYmluaW5nIHNraXAvbGltaXQgd2l0aFxuICAgIC8vIHVub3JkZXJlZCBvYnNlcnZlLiAgZWcsIHVwZGF0ZSdzIEVKU09OLmNsb25lLCBhbmQgdGhlIFwidGhlcmUgYXJlIHNldmVyYWxcIlxuICAgIC8vIGNvbW1lbnQgaW4gX21vZGlmeUFuZE5vdGlmeVxuICAgIC8vIFhYWCBhbGxvdyBza2lwL2xpbWl0IHdpdGggdW5vcmRlcmVkIG9ic2VydmVcbiAgICBpZiAoIW9wdGlvbnMuX2FsbG93X3Vub3JkZXJlZCAmJiAhb3JkZXJlZCAmJiAodGhpcy5za2lwIHx8IHRoaXMubGltaXQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiTXVzdCB1c2UgYW4gb3JkZXJlZCBvYnNlcnZlIHdpdGggc2tpcCBvciBsaW1pdCAoaS5lLiAnYWRkZWRCZWZvcmUnIFwiICtcbiAgICAgICAgXCJmb3Igb2JzZXJ2ZUNoYW5nZXMgb3IgJ2FkZGVkQXQnIGZvciBvYnNlcnZlLCBpbnN0ZWFkIG9mICdhZGRlZCcpLlwiXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmZpZWxkcyAmJiAodGhpcy5maWVsZHMuX2lkID09PSAwIHx8IHRoaXMuZmllbGRzLl9pZCA9PT0gZmFsc2UpKSB7XG4gICAgICB0aHJvdyBFcnJvcignWW91IG1heSBub3Qgb2JzZXJ2ZSBhIGN1cnNvciB3aXRoIHtmaWVsZHM6IHtfaWQ6IDB9fScpO1xuICAgIH1cblxuICAgIGNvbnN0IGRpc3RhbmNlcyA9IChcbiAgICAgIHRoaXMubWF0Y2hlci5oYXNHZW9RdWVyeSgpICYmXG4gICAgICBvcmRlcmVkICYmXG4gICAgICBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcFxuICAgICk7XG5cbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIGN1cnNvcjogdGhpcyxcbiAgICAgIGRpcnR5OiBmYWxzZSxcbiAgICAgIGRpc3RhbmNlcyxcbiAgICAgIG1hdGNoZXI6IHRoaXMubWF0Y2hlciwgLy8gbm90IGZhc3QgcGF0aGVkXG4gICAgICBvcmRlcmVkLFxuICAgICAgcHJvamVjdGlvbkZuOiB0aGlzLl9wcm9qZWN0aW9uRm4sXG4gICAgICByZXN1bHRzU25hcHNob3Q6IG51bGwsXG4gICAgICBzb3J0ZXI6IG9yZGVyZWQgJiYgdGhpcy5zb3J0ZXJcbiAgICB9O1xuXG4gICAgbGV0IHFpZDtcblxuICAgIC8vIE5vbi1yZWFjdGl2ZSBxdWVyaWVzIGNhbGwgYWRkZWRbQmVmb3JlXSBhbmQgdGhlbiBuZXZlciBjYWxsIGFueXRoaW5nXG4gICAgLy8gZWxzZS5cbiAgICBpZiAodGhpcy5yZWFjdGl2ZSkge1xuICAgICAgcWlkID0gdGhpcy5jb2xsZWN0aW9uLm5leHRfcWlkKys7XG4gICAgICB0aGlzLmNvbGxlY3Rpb24ucXVlcmllc1txaWRdID0gcXVlcnk7XG4gICAgfVxuXG4gICAgcXVlcnkucmVzdWx0cyA9IHRoaXMuX2dldFJhd09iamVjdHMoe29yZGVyZWQsIGRpc3RhbmNlczogcXVlcnkuZGlzdGFuY2VzfSk7XG5cbiAgICBpZiAodGhpcy5jb2xsZWN0aW9uLnBhdXNlZCkge1xuICAgICAgcXVlcnkucmVzdWx0c1NuYXBzaG90ID0gb3JkZXJlZCA/IFtdIDogbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gICAgfVxuXG4gICAgLy8gd3JhcCBjYWxsYmFja3Mgd2Ugd2VyZSBwYXNzZWQuIGNhbGxiYWNrcyBvbmx5IGZpcmUgd2hlbiBub3QgcGF1c2VkIGFuZFxuICAgIC8vIGFyZSBuZXZlciB1bmRlZmluZWRcbiAgICAvLyBGaWx0ZXJzIG91dCBibGFja2xpc3RlZCBmaWVsZHMgYWNjb3JkaW5nIHRvIGN1cnNvcidzIHByb2plY3Rpb24uXG4gICAgLy8gWFhYIHdyb25nIHBsYWNlIGZvciB0aGlzP1xuXG4gICAgLy8gZnVydGhlcm1vcmUsIGNhbGxiYWNrcyBlbnF1ZXVlIHVudGlsIHRoZSBvcGVyYXRpb24gd2UncmUgd29ya2luZyBvbiBpc1xuICAgIC8vIGRvbmUuXG4gICAgY29uc3Qgd3JhcENhbGxiYWNrID0gZm4gPT4ge1xuICAgICAgaWYgKCFmbikge1xuICAgICAgICByZXR1cm4gKCkgPT4ge307XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKC8qIGFyZ3MqLykge1xuICAgICAgICBpZiAoc2VsZi5jb2xsZWN0aW9uLnBhdXNlZCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGFyZ3MgPSBhcmd1bWVudHM7XG5cbiAgICAgICAgc2VsZi5jb2xsZWN0aW9uLl9vYnNlcnZlUXVldWUucXVldWVUYXNrKCgpID0+IHtcbiAgICAgICAgICBmbi5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgIH07XG5cbiAgICBxdWVyeS5hZGRlZCA9IHdyYXBDYWxsYmFjayhvcHRpb25zLmFkZGVkKTtcbiAgICBxdWVyeS5jaGFuZ2VkID0gd3JhcENhbGxiYWNrKG9wdGlvbnMuY2hhbmdlZCk7XG4gICAgcXVlcnkucmVtb3ZlZCA9IHdyYXBDYWxsYmFjayhvcHRpb25zLnJlbW92ZWQpO1xuXG4gICAgaWYgKG9yZGVyZWQpIHtcbiAgICAgIHF1ZXJ5LmFkZGVkQmVmb3JlID0gd3JhcENhbGxiYWNrKG9wdGlvbnMuYWRkZWRCZWZvcmUpO1xuICAgICAgcXVlcnkubW92ZWRCZWZvcmUgPSB3cmFwQ2FsbGJhY2sob3B0aW9ucy5tb3ZlZEJlZm9yZSk7XG4gICAgfVxuXG4gICAgaWYgKCFvcHRpb25zLl9zdXBwcmVzc19pbml0aWFsICYmICF0aGlzLmNvbGxlY3Rpb24ucGF1c2VkKSB7XG4gICAgICBxdWVyeS5yZXN1bHRzLmZvckVhY2goZG9jID0+IHtcbiAgICAgICAgY29uc3QgZmllbGRzID0gRUpTT04uY2xvbmUoZG9jKTtcblxuICAgICAgICBkZWxldGUgZmllbGRzLl9pZDtcblxuICAgICAgICBpZiAob3JkZXJlZCkge1xuICAgICAgICAgIHF1ZXJ5LmFkZGVkQmVmb3JlKGRvYy5faWQsIHRoaXMuX3Byb2plY3Rpb25GbihmaWVsZHMpLCBudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHF1ZXJ5LmFkZGVkKGRvYy5faWQsIHRoaXMuX3Byb2plY3Rpb25GbihmaWVsZHMpKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGhhbmRsZSA9IE9iamVjdC5hc3NpZ24obmV3IExvY2FsQ29sbGVjdGlvbi5PYnNlcnZlSGFuZGxlLCB7XG4gICAgICBjb2xsZWN0aW9uOiB0aGlzLmNvbGxlY3Rpb24sXG4gICAgICBzdG9wOiAoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnJlYWN0aXZlKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY29sbGVjdGlvbi5xdWVyaWVzW3FpZF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmICh0aGlzLnJlYWN0aXZlICYmIFRyYWNrZXIuYWN0aXZlKSB7XG4gICAgICAvLyBYWFggaW4gbWFueSBjYXNlcywgdGhlIHNhbWUgb2JzZXJ2ZSB3aWxsIGJlIHJlY3JlYXRlZCB3aGVuXG4gICAgICAvLyB0aGUgY3VycmVudCBhdXRvcnVuIGlzIHJlcnVuLiAgd2UgY291bGQgc2F2ZSB3b3JrIGJ5XG4gICAgICAvLyBsZXR0aW5nIGl0IGxpbmdlciBhY3Jvc3MgcmVydW4gYW5kIHBvdGVudGlhbGx5IGdldFxuICAgICAgLy8gcmVwdXJwb3NlZCBpZiB0aGUgc2FtZSBvYnNlcnZlIGlzIHBlcmZvcm1lZCwgdXNpbmcgbG9naWNcbiAgICAgIC8vIHNpbWlsYXIgdG8gdGhhdCBvZiBNZXRlb3Iuc3Vic2NyaWJlLlxuICAgICAgVHJhY2tlci5vbkludmFsaWRhdGUoKCkgPT4ge1xuICAgICAgICBoYW5kbGUuc3RvcCgpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gcnVuIHRoZSBvYnNlcnZlIGNhbGxiYWNrcyByZXN1bHRpbmcgZnJvbSB0aGUgaW5pdGlhbCBjb250ZW50c1xuICAgIC8vIGJlZm9yZSB3ZSBsZWF2ZSB0aGUgb2JzZXJ2ZS5cbiAgICB0aGlzLmNvbGxlY3Rpb24uX29ic2VydmVRdWV1ZS5kcmFpbigpO1xuXG4gICAgcmV0dXJuIGhhbmRsZTtcbiAgfVxuXG4gIC8vIFhYWCBNYXliZSB3ZSBuZWVkIGEgdmVyc2lvbiBvZiBvYnNlcnZlIHRoYXQganVzdCBjYWxscyBhIGNhbGxiYWNrIGlmXG4gIC8vIGFueXRoaW5nIGNoYW5nZWQuXG4gIF9kZXBlbmQoY2hhbmdlcnMsIF9hbGxvd191bm9yZGVyZWQpIHtcbiAgICBpZiAoVHJhY2tlci5hY3RpdmUpIHtcbiAgICAgIGNvbnN0IGRlcGVuZGVuY3kgPSBuZXcgVHJhY2tlci5EZXBlbmRlbmN5O1xuICAgICAgY29uc3Qgbm90aWZ5ID0gZGVwZW5kZW5jeS5jaGFuZ2VkLmJpbmQoZGVwZW5kZW5jeSk7XG5cbiAgICAgIGRlcGVuZGVuY3kuZGVwZW5kKCk7XG5cbiAgICAgIGNvbnN0IG9wdGlvbnMgPSB7X2FsbG93X3Vub3JkZXJlZCwgX3N1cHByZXNzX2luaXRpYWw6IHRydWV9O1xuXG4gICAgICBbJ2FkZGVkJywgJ2FkZGVkQmVmb3JlJywgJ2NoYW5nZWQnLCAnbW92ZWRCZWZvcmUnLCAncmVtb3ZlZCddXG4gICAgICAgIC5mb3JFYWNoKGZuID0+IHtcbiAgICAgICAgICBpZiAoY2hhbmdlcnNbZm5dKSB7XG4gICAgICAgICAgICBvcHRpb25zW2ZuXSA9IG5vdGlmeTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBvYnNlcnZlQ2hhbmdlcyB3aWxsIHN0b3AoKSB3aGVuIHRoaXMgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWRcbiAgICAgIHRoaXMub2JzZXJ2ZUNoYW5nZXMob3B0aW9ucyk7XG4gICAgfVxuICB9XG5cbiAgX2dldENvbGxlY3Rpb25OYW1lKCkge1xuICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb24ubmFtZTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBjb2xsZWN0aW9uIG9mIG1hdGNoaW5nIG9iamVjdHMsIGJ1dCBkb2Vzbid0IGRlZXAgY29weSB0aGVtLlxuICAvL1xuICAvLyBJZiBvcmRlcmVkIGlzIHNldCwgcmV0dXJucyBhIHNvcnRlZCBhcnJheSwgcmVzcGVjdGluZyBzb3J0ZXIsIHNraXAsIGFuZFxuICAvLyBsaW1pdCBwcm9wZXJ0aWVzIG9mIHRoZSBxdWVyeSBwcm92aWRlZCB0aGF0IG9wdGlvbnMuYXBwbHlTa2lwTGltaXQgaXNcbiAgLy8gbm90IHNldCB0byBmYWxzZSAoIzEyMDEpLiBJZiBzb3J0ZXIgaXMgZmFsc2V5LCBubyBzb3J0IC0tIHlvdSBnZXQgdGhlXG4gIC8vIG5hdHVyYWwgb3JkZXIuXG4gIC8vXG4gIC8vIElmIG9yZGVyZWQgaXMgbm90IHNldCwgcmV0dXJucyBhbiBvYmplY3QgbWFwcGluZyBmcm9tIElEIHRvIGRvYyAoc29ydGVyLFxuICAvLyBza2lwIGFuZCBsaW1pdCBzaG91bGQgbm90IGJlIHNldCkuXG4gIC8vXG4gIC8vIElmIG9yZGVyZWQgaXMgc2V0IGFuZCB0aGlzIGN1cnNvciBpcyBhICRuZWFyIGdlb3F1ZXJ5LCB0aGVuIHRoaXMgZnVuY3Rpb25cbiAgLy8gd2lsbCB1c2UgYW4gX0lkTWFwIHRvIHRyYWNrIGVhY2ggZGlzdGFuY2UgZnJvbSB0aGUgJG5lYXIgYXJndW1lbnQgcG9pbnQgaW5cbiAgLy8gb3JkZXIgdG8gdXNlIGl0IGFzIGEgc29ydCBrZXkuIElmIGFuIF9JZE1hcCBpcyBwYXNzZWQgaW4gdGhlICdkaXN0YW5jZXMnXG4gIC8vIGFyZ3VtZW50LCB0aGlzIGZ1bmN0aW9uIHdpbGwgY2xlYXIgaXQgYW5kIHVzZSBpdCBmb3IgdGhpcyBwdXJwb3NlXG4gIC8vIChvdGhlcndpc2UgaXQgd2lsbCBqdXN0IGNyZWF0ZSBpdHMgb3duIF9JZE1hcCkuIFRoZSBvYnNlcnZlQ2hhbmdlc1xuICAvLyBpbXBsZW1lbnRhdGlvbiB1c2VzIHRoaXMgdG8gcmVtZW1iZXIgdGhlIGRpc3RhbmNlcyBhZnRlciB0aGlzIGZ1bmN0aW9uXG4gIC8vIHJldHVybnMuXG4gIF9nZXRSYXdPYmplY3RzKG9wdGlvbnMgPSB7fSkge1xuICAgIC8vIEJ5IGRlZmF1bHQgdGhpcyBtZXRob2Qgd2lsbCByZXNwZWN0IHNraXAgYW5kIGxpbWl0IGJlY2F1c2UgLmZldGNoKCksXG4gICAgLy8gLmZvckVhY2goKSBldGMuLi4gZXhwZWN0IHRoaXMgYmVoYXZpb3VyLiBJdCBjYW4gYmUgZm9yY2VkIHRvIGlnbm9yZVxuICAgIC8vIHNraXAgYW5kIGxpbWl0IGJ5IHNldHRpbmcgYXBwbHlTa2lwTGltaXQgdG8gZmFsc2UgKC5jb3VudCgpIGRvZXMgdGhpcyxcbiAgICAvLyBmb3IgZXhhbXBsZSlcbiAgICBjb25zdCBhcHBseVNraXBMaW1pdCA9IG9wdGlvbnMuYXBwbHlTa2lwTGltaXQgIT09IGZhbHNlO1xuXG4gICAgLy8gWFhYIHVzZSBPcmRlcmVkRGljdCBpbnN0ZWFkIG9mIGFycmF5LCBhbmQgbWFrZSBJZE1hcCBhbmQgT3JkZXJlZERpY3RcbiAgICAvLyBjb21wYXRpYmxlXG4gICAgY29uc3QgcmVzdWx0cyA9IG9wdGlvbnMub3JkZXJlZCA/IFtdIDogbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG5cbiAgICAvLyBmYXN0IHBhdGggZm9yIHNpbmdsZSBJRCB2YWx1ZVxuICAgIGlmICh0aGlzLl9zZWxlY3RvcklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIC8vIElmIHlvdSBoYXZlIG5vbi16ZXJvIHNraXAgYW5kIGFzayBmb3IgYSBzaW5nbGUgaWQsIHlvdSBnZXQgbm90aGluZy5cbiAgICAgIC8vIFRoaXMgaXMgc28gaXQgbWF0Y2hlcyB0aGUgYmVoYXZpb3Igb2YgdGhlICd7X2lkOiBmb299JyBwYXRoLlxuICAgICAgaWYgKGFwcGx5U2tpcExpbWl0ICYmIHRoaXMuc2tpcCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2VsZWN0ZWREb2MgPSB0aGlzLmNvbGxlY3Rpb24uX2RvY3MuZ2V0KHRoaXMuX3NlbGVjdG9ySWQpO1xuXG4gICAgICBpZiAoc2VsZWN0ZWREb2MpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMub3JkZXJlZCkge1xuICAgICAgICAgIHJlc3VsdHMucHVzaChzZWxlY3RlZERvYyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0cy5zZXQodGhpcy5fc2VsZWN0b3JJZCwgc2VsZWN0ZWREb2MpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cblxuICAgIC8vIHNsb3cgcGF0aCBmb3IgYXJiaXRyYXJ5IHNlbGVjdG9yLCBzb3J0LCBza2lwLCBsaW1pdFxuXG4gICAgLy8gaW4gdGhlIG9ic2VydmVDaGFuZ2VzIGNhc2UsIGRpc3RhbmNlcyBpcyBhY3R1YWxseSBwYXJ0IG9mIHRoZSBcInF1ZXJ5XCJcbiAgICAvLyAoaWUsIGxpdmUgcmVzdWx0cyBzZXQpIG9iamVjdC4gIGluIG90aGVyIGNhc2VzLCBkaXN0YW5jZXMgaXMgb25seSB1c2VkXG4gICAgLy8gaW5zaWRlIHRoaXMgZnVuY3Rpb24uXG4gICAgbGV0IGRpc3RhbmNlcztcbiAgICBpZiAodGhpcy5tYXRjaGVyLmhhc0dlb1F1ZXJ5KCkgJiYgb3B0aW9ucy5vcmRlcmVkKSB7XG4gICAgICBpZiAob3B0aW9ucy5kaXN0YW5jZXMpIHtcbiAgICAgICAgZGlzdGFuY2VzID0gb3B0aW9ucy5kaXN0YW5jZXM7XG4gICAgICAgIGRpc3RhbmNlcy5jbGVhcigpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGlzdGFuY2VzID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXAoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLmNvbGxlY3Rpb24uX2RvY3MuZm9yRWFjaCgoZG9jLCBpZCkgPT4ge1xuICAgICAgY29uc3QgbWF0Y2hSZXN1bHQgPSB0aGlzLm1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGRvYyk7XG5cbiAgICAgIGlmIChtYXRjaFJlc3VsdC5yZXN1bHQpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMub3JkZXJlZCkge1xuICAgICAgICAgIHJlc3VsdHMucHVzaChkb2MpO1xuXG4gICAgICAgICAgaWYgKGRpc3RhbmNlcyAmJiBtYXRjaFJlc3VsdC5kaXN0YW5jZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBkaXN0YW5jZXMuc2V0KGlkLCBtYXRjaFJlc3VsdC5kaXN0YW5jZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdHMuc2V0KGlkLCBkb2MpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIE92ZXJyaWRlIHRvIGVuc3VyZSBhbGwgZG9jcyBhcmUgbWF0Y2hlZCBpZiBpZ25vcmluZyBza2lwICYgbGltaXRcbiAgICAgIGlmICghYXBwbHlTa2lwTGltaXQpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhc3QgcGF0aCBmb3IgbGltaXRlZCB1bnNvcnRlZCBxdWVyaWVzLlxuICAgICAgLy8gWFhYICdsZW5ndGgnIGNoZWNrIGhlcmUgc2VlbXMgd3JvbmcgZm9yIG9yZGVyZWRcbiAgICAgIHJldHVybiAoXG4gICAgICAgICF0aGlzLmxpbWl0IHx8XG4gICAgICAgIHRoaXMuc2tpcCB8fFxuICAgICAgICB0aGlzLnNvcnRlciB8fFxuICAgICAgICByZXN1bHRzLmxlbmd0aCAhPT0gdGhpcy5saW1pdFxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIGlmICghb3B0aW9ucy5vcmRlcmVkKSB7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICBpZiAodGhpcy5zb3J0ZXIpIHtcbiAgICAgIHJlc3VsdHMuc29ydCh0aGlzLnNvcnRlci5nZXRDb21wYXJhdG9yKHtkaXN0YW5jZXN9KSk7XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIHRoZSBmdWxsIHNldCBvZiByZXN1bHRzIGlmIHRoZXJlIGlzIG5vIHNraXAgb3IgbGltaXQgb3IgaWYgd2UncmVcbiAgICAvLyBpZ25vcmluZyB0aGVtXG4gICAgaWYgKCFhcHBseVNraXBMaW1pdCB8fCAoIXRoaXMubGltaXQgJiYgIXRoaXMuc2tpcCkpIHtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHRzLnNsaWNlKFxuICAgICAgdGhpcy5za2lwLFxuICAgICAgdGhpcy5saW1pdCA/IHRoaXMubGltaXQgKyB0aGlzLnNraXAgOiByZXN1bHRzLmxlbmd0aFxuICAgICk7XG4gIH1cblxuICBfcHVibGlzaEN1cnNvcihzdWJzY3JpcHRpb24pIHtcbiAgICAvLyBYWFggbWluaW1vbmdvIHNob3VsZCBub3QgZGVwZW5kIG9uIG1vbmdvLWxpdmVkYXRhIVxuICAgIGlmICghUGFja2FnZS5tb25nbykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAnQ2FuXFwndCBwdWJsaXNoIGZyb20gTWluaW1vbmdvIHdpdGhvdXQgdGhlIGBtb25nb2AgcGFja2FnZS4nXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5jb2xsZWN0aW9uLm5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ0NhblxcJ3QgcHVibGlzaCBhIGN1cnNvciBmcm9tIGEgY29sbGVjdGlvbiB3aXRob3V0IGEgbmFtZS4nXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiBQYWNrYWdlLm1vbmdvLk1vbmdvLkNvbGxlY3Rpb24uX3B1Ymxpc2hDdXJzb3IoXG4gICAgICB0aGlzLFxuICAgICAgc3Vic2NyaXB0aW9uLFxuICAgICAgdGhpcy5jb2xsZWN0aW9uLm5hbWVcbiAgICApO1xuICB9XG59XG5cbi8vIEltcGxlbWVudHMgYXN5bmMgdmVyc2lvbiBvZiBjdXJzb3IgbWV0aG9kcyB0byBrZWVwIGNvbGxlY3Rpb25zIGlzb21vcnBoaWNcbkFTWU5DX0NVUlNPUl9NRVRIT0RTLmZvckVhY2gobWV0aG9kID0+IHtcbiAgY29uc3QgYXN5bmNOYW1lID0gZ2V0QXN5bmNNZXRob2ROYW1lKG1ldGhvZCk7XG4gIEN1cnNvci5wcm90b3R5cGVbYXN5bmNOYW1lXSA9IGZ1bmN0aW9uKC4uLmFyZ3MpIHtcbiAgICB0cnkge1xuICAgICAgdGhpc1ttZXRob2RdLmlzQ2FsbGVkRnJvbUFzeW5jID0gdHJ1ZTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpc1ttZXRob2RdLmFwcGx5KHRoaXMsIGFyZ3MpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICB9XG4gIH07XG59KTtcbiIsImltcG9ydCBDdXJzb3IgZnJvbSAnLi9jdXJzb3IuanMnO1xuaW1wb3J0IE9ic2VydmVIYW5kbGUgZnJvbSAnLi9vYnNlcnZlX2hhbmRsZS5qcyc7XG5pbXBvcnQge1xuICBoYXNPd24sXG4gIGlzSW5kZXhhYmxlLFxuICBpc051bWVyaWNLZXksXG4gIGlzT3BlcmF0b3JPYmplY3QsXG4gIHBvcHVsYXRlRG9jdW1lbnRXaXRoUXVlcnlGaWVsZHMsXG4gIHByb2plY3Rpb25EZXRhaWxzLFxufSBmcm9tICcuL2NvbW1vbi5qcyc7XG5cbi8vIFhYWCB0eXBlIGNoZWNraW5nIG9uIHNlbGVjdG9ycyAoZ3JhY2VmdWwgZXJyb3IgaWYgbWFsZm9ybWVkKVxuXG4vLyBMb2NhbENvbGxlY3Rpb246IGEgc2V0IG9mIGRvY3VtZW50cyB0aGF0IHN1cHBvcnRzIHF1ZXJpZXMgYW5kIG1vZGlmaWVycy5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIExvY2FsQ29sbGVjdGlvbiB7XG4gIGNvbnN0cnVjdG9yKG5hbWUpIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgIC8vIF9pZCAtPiBkb2N1bWVudCAoYWxzbyBjb250YWluaW5nIGlkKVxuICAgIHRoaXMuX2RvY3MgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcblxuICAgIHRoaXMuX29ic2VydmVRdWV1ZSA9IG5ldyBNZXRlb3IuX1N5bmNocm9ub3VzUXVldWUoKTtcblxuICAgIHRoaXMubmV4dF9xaWQgPSAxOyAvLyBsaXZlIHF1ZXJ5IGlkIGdlbmVyYXRvclxuXG4gICAgLy8gcWlkIC0+IGxpdmUgcXVlcnkgb2JqZWN0LiBrZXlzOlxuICAgIC8vICBvcmRlcmVkOiBib29sLiBvcmRlcmVkIHF1ZXJpZXMgaGF2ZSBhZGRlZEJlZm9yZS9tb3ZlZEJlZm9yZSBjYWxsYmFja3MuXG4gICAgLy8gIHJlc3VsdHM6IGFycmF5IChvcmRlcmVkKSBvciBvYmplY3QgKHVub3JkZXJlZCkgb2YgY3VycmVudCByZXN1bHRzXG4gICAgLy8gICAgKGFsaWFzZWQgd2l0aCB0aGlzLl9kb2NzISlcbiAgICAvLyAgcmVzdWx0c1NuYXBzaG90OiBzbmFwc2hvdCBvZiByZXN1bHRzLiBudWxsIGlmIG5vdCBwYXVzZWQuXG4gICAgLy8gIGN1cnNvcjogQ3Vyc29yIG9iamVjdCBmb3IgdGhlIHF1ZXJ5LlxuICAgIC8vICBzZWxlY3Rvciwgc29ydGVyLCAoY2FsbGJhY2tzKTogZnVuY3Rpb25zXG4gICAgdGhpcy5xdWVyaWVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuICAgIC8vIG51bGwgaWYgbm90IHNhdmluZyBvcmlnaW5hbHM7IGFuIElkTWFwIGZyb20gaWQgdG8gb3JpZ2luYWwgZG9jdW1lbnQgdmFsdWVcbiAgICAvLyBpZiBzYXZpbmcgb3JpZ2luYWxzLiBTZWUgY29tbWVudHMgYmVmb3JlIHNhdmVPcmlnaW5hbHMoKS5cbiAgICB0aGlzLl9zYXZlZE9yaWdpbmFscyA9IG51bGw7XG5cbiAgICAvLyBUcnVlIHdoZW4gb2JzZXJ2ZXJzIGFyZSBwYXVzZWQgYW5kIHdlIHNob3VsZCBub3Qgc2VuZCBjYWxsYmFja3MuXG4gICAgdGhpcy5wYXVzZWQgPSBmYWxzZTtcbiAgfVxuXG4gIGNvdW50RG9jdW1lbnRzKHNlbGVjdG9yLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIHRoaXMuZmluZChzZWxlY3RvciA/PyB7fSwgb3B0aW9ucykuY291bnRBc3luYygpO1xuICB9XG5cbiAgZXN0aW1hdGVkRG9jdW1lbnRDb3VudChvcHRpb25zKSB7XG4gICAgcmV0dXJuIHRoaXMuZmluZCh7fSwgb3B0aW9ucykuY291bnRBc3luYygpO1xuICB9XG5cbiAgLy8gb3B0aW9ucyBtYXkgaW5jbHVkZSBzb3J0LCBza2lwLCBsaW1pdCwgcmVhY3RpdmVcbiAgLy8gc29ydCBtYXkgYmUgYW55IG9mIHRoZXNlIGZvcm1zOlxuICAvLyAgICAge2E6IDEsIGI6IC0xfVxuICAvLyAgICAgW1tcImFcIiwgXCJhc2NcIl0sIFtcImJcIiwgXCJkZXNjXCJdXVxuICAvLyAgICAgW1wiYVwiLCBbXCJiXCIsIFwiZGVzY1wiXV1cbiAgLy8gICAoaW4gdGhlIGZpcnN0IGZvcm0geW91J3JlIGJlaG9sZGVuIHRvIGtleSBlbnVtZXJhdGlvbiBvcmRlciBpblxuICAvLyAgIHlvdXIgamF2YXNjcmlwdCBWTSlcbiAgLy9cbiAgLy8gcmVhY3RpdmU6IGlmIGdpdmVuLCBhbmQgZmFsc2UsIGRvbid0IHJlZ2lzdGVyIHdpdGggVHJhY2tlciAoZGVmYXVsdFxuICAvLyBpcyB0cnVlKVxuICAvL1xuICAvLyBYWFggcG9zc2libHkgc2hvdWxkIHN1cHBvcnQgcmV0cmlldmluZyBhIHN1YnNldCBvZiBmaWVsZHM/IGFuZFxuICAvLyBoYXZlIGl0IGJlIGEgaGludCAoaWdub3JlZCBvbiB0aGUgY2xpZW50LCB3aGVuIG5vdCBjb3B5aW5nIHRoZVxuICAvLyBkb2M/KVxuICAvL1xuICAvLyBYWFggc29ydCBkb2VzIG5vdCB5ZXQgc3VwcG9ydCBzdWJrZXlzICgnYS5iJykgLi4gZml4IHRoYXQhXG4gIC8vIFhYWCBhZGQgb25lIG1vcmUgc29ydCBmb3JtOiBcImtleVwiXG4gIC8vIFhYWCB0ZXN0c1xuICBmaW5kKHNlbGVjdG9yLCBvcHRpb25zKSB7XG4gICAgLy8gZGVmYXVsdCBzeW50YXggZm9yIGV2ZXJ5dGhpbmcgaXMgdG8gb21pdCB0aGUgc2VsZWN0b3IgYXJndW1lbnQuXG4gICAgLy8gYnV0IGlmIHNlbGVjdG9yIGlzIGV4cGxpY2l0bHkgcGFzc2VkIGluIGFzIGZhbHNlIG9yIHVuZGVmaW5lZCwgd2VcbiAgICAvLyB3YW50IGEgc2VsZWN0b3IgdGhhdCBtYXRjaGVzIG5vdGhpbmcuXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHNlbGVjdG9yID0ge307XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBMb2NhbENvbGxlY3Rpb24uQ3Vyc29yKHRoaXMsIHNlbGVjdG9yLCBvcHRpb25zKTtcbiAgfVxuXG4gIGZpbmRPbmUoc2VsZWN0b3IsIG9wdGlvbnMgPSB7fSkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBzZWxlY3RvciA9IHt9O1xuICAgIH1cblxuICAgIC8vIE5PVEU6IGJ5IHNldHRpbmcgbGltaXQgMSBoZXJlLCB3ZSBlbmQgdXAgdXNpbmcgdmVyeSBpbmVmZmljaWVudFxuICAgIC8vIGNvZGUgdGhhdCByZWNvbXB1dGVzIHRoZSB3aG9sZSBxdWVyeSBvbiBlYWNoIHVwZGF0ZS4gVGhlIHVwc2lkZSBpc1xuICAgIC8vIHRoYXQgd2hlbiB5b3UgcmVhY3RpdmVseSBkZXBlbmQgb24gYSBmaW5kT25lIHlvdSBvbmx5IGdldFxuICAgIC8vIGludmFsaWRhdGVkIHdoZW4gdGhlIGZvdW5kIG9iamVjdCBjaGFuZ2VzLCBub3QgYW55IG9iamVjdCBpbiB0aGVcbiAgICAvLyBjb2xsZWN0aW9uLiBNb3N0IGZpbmRPbmUgd2lsbCBiZSBieSBpZCwgd2hpY2ggaGFzIGEgZmFzdCBwYXRoLCBzb1xuICAgIC8vIHRoaXMgbWlnaHQgbm90IGJlIGEgYmlnIGRlYWwuIEluIG1vc3QgY2FzZXMsIGludmFsaWRhdGlvbiBjYXVzZXNcbiAgICAvLyB0aGUgY2FsbGVkIHRvIHJlLXF1ZXJ5IGFueXdheSwgc28gdGhpcyBzaG91bGQgYmUgYSBuZXQgcGVyZm9ybWFuY2VcbiAgICAvLyBpbXByb3ZlbWVudC5cbiAgICBvcHRpb25zLmxpbWl0ID0gMTtcblxuICAgIHJldHVybiB0aGlzLmZpbmQoc2VsZWN0b3IsIG9wdGlvbnMpLmZldGNoKClbMF07XG4gIH1cblxuICAvLyBYWFggcG9zc2libHkgZW5mb3JjZSB0aGF0ICd1bmRlZmluZWQnIGRvZXMgbm90IGFwcGVhciAod2UgYXNzdW1lXG4gIC8vIHRoaXMgaW4gb3VyIGhhbmRsaW5nIG9mIG51bGwgYW5kICRleGlzdHMpXG4gIGluc2VydChkb2MsIGNhbGxiYWNrKSB7XG4gICAgZG9jID0gRUpTT04uY2xvbmUoZG9jKTtcblxuICAgIGFzc2VydEhhc1ZhbGlkRmllbGROYW1lcyhkb2MpO1xuXG4gICAgLy8gaWYgeW91IHJlYWxseSB3YW50IHRvIHVzZSBPYmplY3RJRHMsIHNldCB0aGlzIGdsb2JhbC5cbiAgICAvLyBNb25nby5Db2xsZWN0aW9uIHNwZWNpZmllcyBpdHMgb3duIGlkcyBhbmQgZG9lcyBub3QgdXNlIHRoaXMgY29kZS5cbiAgICBpZiAoIWhhc093bi5jYWxsKGRvYywgJ19pZCcpKSB7XG4gICAgICBkb2MuX2lkID0gTG9jYWxDb2xsZWN0aW9uLl91c2VPSUQgPyBuZXcgTW9uZ29JRC5PYmplY3RJRCgpIDogUmFuZG9tLmlkKCk7XG4gICAgfVxuXG4gICAgY29uc3QgaWQgPSBkb2MuX2lkO1xuXG4gICAgaWYgKHRoaXMuX2RvY3MuaGFzKGlkKSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoYER1cGxpY2F0ZSBfaWQgJyR7aWR9J2ApO1xuICAgIH1cblxuICAgIHRoaXMuX3NhdmVPcmlnaW5hbChpZCwgdW5kZWZpbmVkKTtcbiAgICB0aGlzLl9kb2NzLnNldChpZCwgZG9jKTtcblxuICAgIGNvbnN0IHF1ZXJpZXNUb1JlY29tcHV0ZSA9IFtdO1xuXG4gICAgLy8gdHJpZ2dlciBsaXZlIHF1ZXJpZXMgdGhhdCBtYXRjaFxuICAgIE9iamVjdC5rZXlzKHRoaXMucXVlcmllcykuZm9yRWFjaChxaWQgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5LmRpcnR5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbWF0Y2hSZXN1bHQgPSBxdWVyeS5tYXRjaGVyLmRvY3VtZW50TWF0Y2hlcyhkb2MpO1xuXG4gICAgICBpZiAobWF0Y2hSZXN1bHQucmVzdWx0KSB7XG4gICAgICAgIGlmIChxdWVyeS5kaXN0YW5jZXMgJiYgbWF0Y2hSZXN1bHQuZGlzdGFuY2UgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHF1ZXJ5LmRpc3RhbmNlcy5zZXQoaWQsIG1hdGNoUmVzdWx0LmRpc3RhbmNlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChxdWVyeS5jdXJzb3Iuc2tpcCB8fCBxdWVyeS5jdXJzb3IubGltaXQpIHtcbiAgICAgICAgICBxdWVyaWVzVG9SZWNvbXB1dGUucHVzaChxaWQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIExvY2FsQ29sbGVjdGlvbi5faW5zZXJ0SW5SZXN1bHRzKHF1ZXJ5LCBkb2MpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBxdWVyaWVzVG9SZWNvbXB1dGUuZm9yRWFjaChxaWQgPT4ge1xuICAgICAgaWYgKHRoaXMucXVlcmllc1txaWRdKSB7XG4gICAgICAgIHRoaXMuX3JlY29tcHV0ZVJlc3VsdHModGhpcy5xdWVyaWVzW3FpZF0pO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5fb2JzZXJ2ZVF1ZXVlLmRyYWluKCk7XG5cbiAgICAvLyBEZWZlciBiZWNhdXNlIHRoZSBjYWxsZXIgbGlrZWx5IGRvZXNuJ3QgZXhwZWN0IHRoZSBjYWxsYmFjayB0byBiZSBydW5cbiAgICAvLyBpbW1lZGlhdGVseS5cbiAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgIE1ldGVvci5kZWZlcigoKSA9PiB7XG4gICAgICAgIGNhbGxiYWNrKG51bGwsIGlkKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBpZDtcbiAgfVxuXG4gIC8vIFBhdXNlIHRoZSBvYnNlcnZlcnMuIE5vIGNhbGxiYWNrcyBmcm9tIG9ic2VydmVycyB3aWxsIGZpcmUgdW50aWxcbiAgLy8gJ3Jlc3VtZU9ic2VydmVycycgaXMgY2FsbGVkLlxuICBwYXVzZU9ic2VydmVycygpIHtcbiAgICAvLyBOby1vcCBpZiBhbHJlYWR5IHBhdXNlZC5cbiAgICBpZiAodGhpcy5wYXVzZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTZXQgdGhlICdwYXVzZWQnIGZsYWcgc3VjaCB0aGF0IG5ldyBvYnNlcnZlciBtZXNzYWdlcyBkb24ndCBmaXJlLlxuICAgIHRoaXMucGF1c2VkID0gdHJ1ZTtcblxuICAgIC8vIFRha2UgYSBzbmFwc2hvdCBvZiB0aGUgcXVlcnkgcmVzdWx0cyBmb3IgZWFjaCBxdWVyeS5cbiAgICBPYmplY3Qua2V5cyh0aGlzLnF1ZXJpZXMpLmZvckVhY2gocWlkID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG4gICAgICBxdWVyeS5yZXN1bHRzU25hcHNob3QgPSBFSlNPTi5jbG9uZShxdWVyeS5yZXN1bHRzKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJlbW92ZShzZWxlY3RvciwgY2FsbGJhY2spIHtcbiAgICAvLyBFYXN5IHNwZWNpYWwgY2FzZTogaWYgd2UncmUgbm90IGNhbGxpbmcgb2JzZXJ2ZUNoYW5nZXMgY2FsbGJhY2tzIGFuZFxuICAgIC8vIHdlJ3JlIG5vdCBzYXZpbmcgb3JpZ2luYWxzIGFuZCB3ZSBnb3QgYXNrZWQgdG8gcmVtb3ZlIGV2ZXJ5dGhpbmcsIHRoZW5cbiAgICAvLyBqdXN0IGVtcHR5IGV2ZXJ5dGhpbmcgZGlyZWN0bHkuXG4gICAgaWYgKHRoaXMucGF1c2VkICYmICF0aGlzLl9zYXZlZE9yaWdpbmFscyAmJiBFSlNPTi5lcXVhbHMoc2VsZWN0b3IsIHt9KSkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fZG9jcy5zaXplKCk7XG5cbiAgICAgIHRoaXMuX2RvY3MuY2xlYXIoKTtcblxuICAgICAgT2JqZWN0LmtleXModGhpcy5xdWVyaWVzKS5mb3JFYWNoKHFpZCA9PiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG5cbiAgICAgICAgaWYgKHF1ZXJ5Lm9yZGVyZWQpIHtcbiAgICAgICAgICBxdWVyeS5yZXN1bHRzID0gW107XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcXVlcnkucmVzdWx0cy5jbGVhcigpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgIE1ldGVvci5kZWZlcigoKSA9PiB7XG4gICAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgY29uc3QgbWF0Y2hlciA9IG5ldyBNaW5pbW9uZ28uTWF0Y2hlcihzZWxlY3Rvcik7XG4gICAgY29uc3QgcmVtb3ZlID0gW107XG5cbiAgICB0aGlzLl9lYWNoUG9zc2libHlNYXRjaGluZ0RvYyhzZWxlY3RvciwgKGRvYywgaWQpID0+IHtcbiAgICAgIGlmIChtYXRjaGVyLmRvY3VtZW50TWF0Y2hlcyhkb2MpLnJlc3VsdCkge1xuICAgICAgICByZW1vdmUucHVzaChpZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBxdWVyaWVzVG9SZWNvbXB1dGUgPSBbXTtcbiAgICBjb25zdCBxdWVyeVJlbW92ZSA9IFtdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCByZW1vdmUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHJlbW92ZUlkID0gcmVtb3ZlW2ldO1xuICAgICAgY29uc3QgcmVtb3ZlRG9jID0gdGhpcy5fZG9jcy5nZXQocmVtb3ZlSWQpO1xuXG4gICAgICBPYmplY3Qua2V5cyh0aGlzLnF1ZXJpZXMpLmZvckVhY2gocWlkID0+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgICBpZiAocXVlcnkuZGlydHkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocXVlcnkubWF0Y2hlci5kb2N1bWVudE1hdGNoZXMocmVtb3ZlRG9jKS5yZXN1bHQpIHtcbiAgICAgICAgICBpZiAocXVlcnkuY3Vyc29yLnNraXAgfHwgcXVlcnkuY3Vyc29yLmxpbWl0KSB7XG4gICAgICAgICAgICBxdWVyaWVzVG9SZWNvbXB1dGUucHVzaChxaWQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBxdWVyeVJlbW92ZS5wdXNoKHtxaWQsIGRvYzogcmVtb3ZlRG9jfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgdGhpcy5fc2F2ZU9yaWdpbmFsKHJlbW92ZUlkLCByZW1vdmVEb2MpO1xuICAgICAgdGhpcy5fZG9jcy5yZW1vdmUocmVtb3ZlSWQpO1xuICAgIH1cblxuICAgIC8vIHJ1biBsaXZlIHF1ZXJ5IGNhbGxiYWNrcyBfYWZ0ZXJfIHdlJ3ZlIHJlbW92ZWQgdGhlIGRvY3VtZW50cy5cbiAgICBxdWVyeVJlbW92ZS5mb3JFYWNoKHJlbW92ZSA9PiB7XG4gICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcmllc1tyZW1vdmUucWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5KSB7XG4gICAgICAgIHF1ZXJ5LmRpc3RhbmNlcyAmJiBxdWVyeS5kaXN0YW5jZXMucmVtb3ZlKHJlbW92ZS5kb2MuX2lkKTtcbiAgICAgICAgTG9jYWxDb2xsZWN0aW9uLl9yZW1vdmVGcm9tUmVzdWx0cyhxdWVyeSwgcmVtb3ZlLmRvYyk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBxdWVyaWVzVG9SZWNvbXB1dGUuZm9yRWFjaChxaWQgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuX3JlY29tcHV0ZVJlc3VsdHMocXVlcnkpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5fb2JzZXJ2ZVF1ZXVlLmRyYWluKCk7XG5cbiAgICBjb25zdCByZXN1bHQgPSByZW1vdmUubGVuZ3RoO1xuXG4gICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICBNZXRlb3IuZGVmZXIoKCkgPT4ge1xuICAgICAgICBjYWxsYmFjayhudWxsLCByZXN1bHQpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIFJlc3VtZSB0aGUgb2JzZXJ2ZXJzLiBPYnNlcnZlcnMgaW1tZWRpYXRlbHkgcmVjZWl2ZSBjaGFuZ2VcbiAgLy8gbm90aWZpY2F0aW9ucyB0byBicmluZyB0aGVtIHRvIHRoZSBjdXJyZW50IHN0YXRlIG9mIHRoZVxuICAvLyBkYXRhYmFzZS4gTm90ZSB0aGF0IHRoaXMgaXMgbm90IGp1c3QgcmVwbGF5aW5nIGFsbCB0aGUgY2hhbmdlcyB0aGF0XG4gIC8vIGhhcHBlbmVkIGR1cmluZyB0aGUgcGF1c2UsIGl0IGlzIGEgc21hcnRlciAnY29hbGVzY2VkJyBkaWZmLlxuICByZXN1bWVPYnNlcnZlcnMoKSB7XG4gICAgLy8gTm8tb3AgaWYgbm90IHBhdXNlZC5cbiAgICBpZiAoIXRoaXMucGF1c2VkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVW5zZXQgdGhlICdwYXVzZWQnIGZsYWcuIE1ha2Ugc3VyZSB0byBkbyB0aGlzIGZpcnN0LCBvdGhlcndpc2VcbiAgICAvLyBvYnNlcnZlciBtZXRob2RzIHdvbid0IGFjdHVhbGx5IGZpcmUgd2hlbiB3ZSB0cmlnZ2VyIHRoZW0uXG4gICAgdGhpcy5wYXVzZWQgPSBmYWxzZTtcblxuICAgIE9iamVjdC5rZXlzKHRoaXMucXVlcmllcykuZm9yRWFjaChxaWQgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5LmRpcnR5KSB7XG4gICAgICAgIHF1ZXJ5LmRpcnR5ID0gZmFsc2U7XG5cbiAgICAgICAgLy8gcmUtY29tcHV0ZSByZXN1bHRzIHdpbGwgcGVyZm9ybSBgTG9jYWxDb2xsZWN0aW9uLl9kaWZmUXVlcnlDaGFuZ2VzYFxuICAgICAgICAvLyBhdXRvbWF0aWNhbGx5LlxuICAgICAgICB0aGlzLl9yZWNvbXB1dGVSZXN1bHRzKHF1ZXJ5LCBxdWVyeS5yZXN1bHRzU25hcHNob3QpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlmZiB0aGUgY3VycmVudCByZXN1bHRzIGFnYWluc3QgdGhlIHNuYXBzaG90IGFuZCBzZW5kIHRvIG9ic2VydmVycy5cbiAgICAgICAgLy8gcGFzcyB0aGUgcXVlcnkgb2JqZWN0IGZvciBpdHMgb2JzZXJ2ZXIgY2FsbGJhY2tzLlxuICAgICAgICBMb2NhbENvbGxlY3Rpb24uX2RpZmZRdWVyeUNoYW5nZXMoXG4gICAgICAgICAgcXVlcnkub3JkZXJlZCxcbiAgICAgICAgICBxdWVyeS5yZXN1bHRzU25hcHNob3QsXG4gICAgICAgICAgcXVlcnkucmVzdWx0cyxcbiAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICB7cHJvamVjdGlvbkZuOiBxdWVyeS5wcm9qZWN0aW9uRm59XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHF1ZXJ5LnJlc3VsdHNTbmFwc2hvdCA9IG51bGw7XG4gICAgfSk7XG5cbiAgICB0aGlzLl9vYnNlcnZlUXVldWUuZHJhaW4oKTtcbiAgfVxuXG4gIHJldHJpZXZlT3JpZ2luYWxzKCkge1xuICAgIGlmICghdGhpcy5fc2F2ZWRPcmlnaW5hbHMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2FsbGVkIHJldHJpZXZlT3JpZ2luYWxzIHdpdGhvdXQgc2F2ZU9yaWdpbmFscycpO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFscyA9IHRoaXMuX3NhdmVkT3JpZ2luYWxzO1xuXG4gICAgdGhpcy5fc2F2ZWRPcmlnaW5hbHMgPSBudWxsO1xuXG4gICAgcmV0dXJuIG9yaWdpbmFscztcbiAgfVxuXG4gIC8vIFRvIHRyYWNrIHdoYXQgZG9jdW1lbnRzIGFyZSBhZmZlY3RlZCBieSBhIHBpZWNlIG9mIGNvZGUsIGNhbGxcbiAgLy8gc2F2ZU9yaWdpbmFscygpIGJlZm9yZSBpdCBhbmQgcmV0cmlldmVPcmlnaW5hbHMoKSBhZnRlciBpdC5cbiAgLy8gcmV0cmlldmVPcmlnaW5hbHMgcmV0dXJucyBhbiBvYmplY3Qgd2hvc2Uga2V5cyBhcmUgdGhlIGlkcyBvZiB0aGUgZG9jdW1lbnRzXG4gIC8vIHRoYXQgd2VyZSBhZmZlY3RlZCBzaW5jZSB0aGUgY2FsbCB0byBzYXZlT3JpZ2luYWxzKCksIGFuZCB0aGUgdmFsdWVzIGFyZVxuICAvLyBlcXVhbCB0byB0aGUgZG9jdW1lbnQncyBjb250ZW50cyBhdCB0aGUgdGltZSBvZiBzYXZlT3JpZ2luYWxzLiAoSW4gdGhlIGNhc2VcbiAgLy8gb2YgYW4gaW5zZXJ0ZWQgZG9jdW1lbnQsIHVuZGVmaW5lZCBpcyB0aGUgdmFsdWUuKSBZb3UgbXVzdCBhbHRlcm5hdGVcbiAgLy8gYmV0d2VlbiBjYWxscyB0byBzYXZlT3JpZ2luYWxzKCkgYW5kIHJldHJpZXZlT3JpZ2luYWxzKCkuXG4gIHNhdmVPcmlnaW5hbHMoKSB7XG4gICAgaWYgKHRoaXMuX3NhdmVkT3JpZ2luYWxzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbGxlZCBzYXZlT3JpZ2luYWxzIHR3aWNlIHdpdGhvdXQgcmV0cmlldmVPcmlnaW5hbHMnKTtcbiAgICB9XG5cbiAgICB0aGlzLl9zYXZlZE9yaWdpbmFscyA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuICB9XG5cbiAgLy8gWFhYIGF0b21pY2l0eTogaWYgbXVsdGkgaXMgdHJ1ZSwgYW5kIG9uZSBtb2RpZmljYXRpb24gZmFpbHMsIGRvXG4gIC8vIHdlIHJvbGxiYWNrIHRoZSB3aG9sZSBvcGVyYXRpb24sIG9yIHdoYXQ/XG4gIHVwZGF0ZShzZWxlY3RvciwgbW9kLCBvcHRpb25zLCBjYWxsYmFjaykge1xuICAgIGlmICghIGNhbGxiYWNrICYmIG9wdGlvbnMgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgY2FsbGJhY2sgPSBvcHRpb25zO1xuICAgICAgb3B0aW9ucyA9IG51bGw7XG4gICAgfVxuXG4gICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICBvcHRpb25zID0ge307XG4gICAgfVxuXG4gICAgY29uc3QgbWF0Y2hlciA9IG5ldyBNaW5pbW9uZ28uTWF0Y2hlcihzZWxlY3RvciwgdHJ1ZSk7XG5cbiAgICAvLyBTYXZlIHRoZSBvcmlnaW5hbCByZXN1bHRzIG9mIGFueSBxdWVyeSB0aGF0IHdlIG1pZ2h0IG5lZWQgdG9cbiAgICAvLyBfcmVjb21wdXRlUmVzdWx0cyBvbiwgYmVjYXVzZSBfbW9kaWZ5QW5kTm90aWZ5IHdpbGwgbXV0YXRlIHRoZSBvYmplY3RzIGluXG4gICAgLy8gaXQuIChXZSBkb24ndCBuZWVkIHRvIHNhdmUgdGhlIG9yaWdpbmFsIHJlc3VsdHMgb2YgcGF1c2VkIHF1ZXJpZXMgYmVjYXVzZVxuICAgIC8vIHRoZXkgYWxyZWFkeSBoYXZlIGEgcmVzdWx0c1NuYXBzaG90IGFuZCB3ZSB3b24ndCBiZSBkaWZmaW5nIGluXG4gICAgLy8gX3JlY29tcHV0ZVJlc3VsdHMuKVxuICAgIGNvbnN0IHFpZFRvT3JpZ2luYWxSZXN1bHRzID0ge307XG5cbiAgICAvLyBXZSBzaG91bGQgb25seSBjbG9uZSBlYWNoIGRvY3VtZW50IG9uY2UsIGV2ZW4gaWYgaXQgYXBwZWFycyBpbiBtdWx0aXBsZVxuICAgIC8vIHF1ZXJpZXNcbiAgICBjb25zdCBkb2NNYXAgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgICBjb25zdCBpZHNNYXRjaGVkID0gTG9jYWxDb2xsZWN0aW9uLl9pZHNNYXRjaGVkQnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cbiAgICBPYmplY3Qua2V5cyh0aGlzLnF1ZXJpZXMpLmZvckVhY2gocWlkID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG5cbiAgICAgIGlmICgocXVlcnkuY3Vyc29yLnNraXAgfHwgcXVlcnkuY3Vyc29yLmxpbWl0KSAmJiAhIHRoaXMucGF1c2VkKSB7XG4gICAgICAgIC8vIENhdGNoIHRoZSBjYXNlIG9mIGEgcmVhY3RpdmUgYGNvdW50KClgIG9uIGEgY3Vyc29yIHdpdGggc2tpcFxuICAgICAgICAvLyBvciBsaW1pdCwgd2hpY2ggcmVnaXN0ZXJzIGFuIHVub3JkZXJlZCBvYnNlcnZlLiBUaGlzIGlzIGFcbiAgICAgICAgLy8gcHJldHR5IHJhcmUgY2FzZSwgc28gd2UganVzdCBjbG9uZSB0aGUgZW50aXJlIHJlc3VsdCBzZXQgd2l0aFxuICAgICAgICAvLyBubyBvcHRpbWl6YXRpb25zIGZvciBkb2N1bWVudHMgdGhhdCBhcHBlYXIgaW4gdGhlc2UgcmVzdWx0XG4gICAgICAgIC8vIHNldHMgYW5kIG90aGVyIHF1ZXJpZXMuXG4gICAgICAgIGlmIChxdWVyeS5yZXN1bHRzIGluc3RhbmNlb2YgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcCkge1xuICAgICAgICAgIHFpZFRvT3JpZ2luYWxSZXN1bHRzW3FpZF0gPSBxdWVyeS5yZXN1bHRzLmNsb25lKCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCEocXVlcnkucmVzdWx0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQXNzZXJ0aW9uIGZhaWxlZDogcXVlcnkucmVzdWx0cyBub3QgYW4gYXJyYXknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENsb25lcyBhIGRvY3VtZW50IHRvIGJlIHN0b3JlZCBpbiBgcWlkVG9PcmlnaW5hbFJlc3VsdHNgXG4gICAgICAgIC8vIGJlY2F1c2UgaXQgbWF5IGJlIG1vZGlmaWVkIGJlZm9yZSB0aGUgbmV3IGFuZCBvbGQgcmVzdWx0IHNldHNcbiAgICAgICAgLy8gYXJlIGRpZmZlZC4gQnV0IGlmIHdlIGtub3cgZXhhY3RseSB3aGljaCBkb2N1bWVudCBJRHMgd2UncmVcbiAgICAgICAgLy8gZ29pbmcgdG8gbW9kaWZ5LCB0aGVuIHdlIG9ubHkgbmVlZCB0byBjbG9uZSB0aG9zZS5cbiAgICAgICAgY29uc3QgbWVtb2l6ZWRDbG9uZUlmTmVlZGVkID0gZG9jID0+IHtcbiAgICAgICAgICBpZiAoZG9jTWFwLmhhcyhkb2MuX2lkKSkge1xuICAgICAgICAgICAgcmV0dXJuIGRvY01hcC5nZXQoZG9jLl9pZCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgZG9jVG9NZW1vaXplID0gKFxuICAgICAgICAgICAgaWRzTWF0Y2hlZCAmJlxuICAgICAgICAgICAgIWlkc01hdGNoZWQuc29tZShpZCA9PiBFSlNPTi5lcXVhbHMoaWQsIGRvYy5faWQpKVxuICAgICAgICAgICkgPyBkb2MgOiBFSlNPTi5jbG9uZShkb2MpO1xuXG4gICAgICAgICAgZG9jTWFwLnNldChkb2MuX2lkLCBkb2NUb01lbW9pemUpO1xuXG4gICAgICAgICAgcmV0dXJuIGRvY1RvTWVtb2l6ZTtcbiAgICAgICAgfTtcblxuICAgICAgICBxaWRUb09yaWdpbmFsUmVzdWx0c1txaWRdID0gcXVlcnkucmVzdWx0cy5tYXAobWVtb2l6ZWRDbG9uZUlmTmVlZGVkKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHJlY29tcHV0ZVFpZHMgPSB7fTtcblxuICAgIGxldCB1cGRhdGVDb3VudCA9IDA7XG5cbiAgICB0aGlzLl9lYWNoUG9zc2libHlNYXRjaGluZ0RvYyhzZWxlY3RvciwgKGRvYywgaWQpID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5UmVzdWx0ID0gbWF0Y2hlci5kb2N1bWVudE1hdGNoZXMoZG9jKTtcblxuICAgICAgaWYgKHF1ZXJ5UmVzdWx0LnJlc3VsdCkge1xuICAgICAgICAvLyBYWFggU2hvdWxkIHdlIHNhdmUgdGhlIG9yaWdpbmFsIGV2ZW4gaWYgbW9kIGVuZHMgdXAgYmVpbmcgYSBuby1vcD9cbiAgICAgICAgdGhpcy5fc2F2ZU9yaWdpbmFsKGlkLCBkb2MpO1xuICAgICAgICB0aGlzLl9tb2RpZnlBbmROb3RpZnkoXG4gICAgICAgICAgZG9jLFxuICAgICAgICAgIG1vZCxcbiAgICAgICAgICByZWNvbXB1dGVRaWRzLFxuICAgICAgICAgIHF1ZXJ5UmVzdWx0LmFycmF5SW5kaWNlc1xuICAgICAgICApO1xuXG4gICAgICAgICsrdXBkYXRlQ291bnQ7XG5cbiAgICAgICAgaWYgKCFvcHRpb25zLm11bHRpKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBicmVha1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuXG4gICAgT2JqZWN0LmtleXMocmVjb21wdXRlUWlkcykuZm9yRWFjaChxaWQgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuX3JlY29tcHV0ZVJlc3VsdHMocXVlcnksIHFpZFRvT3JpZ2luYWxSZXN1bHRzW3FpZF0pO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5fb2JzZXJ2ZVF1ZXVlLmRyYWluKCk7XG5cbiAgICAvLyBJZiB3ZSBhcmUgZG9pbmcgYW4gdXBzZXJ0LCBhbmQgd2UgZGlkbid0IG1vZGlmeSBhbnkgZG9jdW1lbnRzIHlldCwgdGhlblxuICAgIC8vIGl0J3MgdGltZSB0byBkbyBhbiBpbnNlcnQuIEZpZ3VyZSBvdXQgd2hhdCBkb2N1bWVudCB3ZSBhcmUgaW5zZXJ0aW5nLCBhbmRcbiAgICAvLyBnZW5lcmF0ZSBhbiBpZCBmb3IgaXQuXG4gICAgbGV0IGluc2VydGVkSWQ7XG4gICAgaWYgKHVwZGF0ZUNvdW50ID09PSAwICYmIG9wdGlvbnMudXBzZXJ0KSB7XG4gICAgICBjb25zdCBkb2MgPSBMb2NhbENvbGxlY3Rpb24uX2NyZWF0ZVVwc2VydERvY3VtZW50KHNlbGVjdG9yLCBtb2QpO1xuICAgICAgaWYgKCEgZG9jLl9pZCAmJiBvcHRpb25zLmluc2VydGVkSWQpIHtcbiAgICAgICAgZG9jLl9pZCA9IG9wdGlvbnMuaW5zZXJ0ZWRJZDtcbiAgICAgIH1cblxuICAgICAgaW5zZXJ0ZWRJZCA9IHRoaXMuaW5zZXJ0KGRvYyk7XG4gICAgICB1cGRhdGVDb3VudCA9IDE7XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIHRoZSBudW1iZXIgb2YgYWZmZWN0ZWQgZG9jdW1lbnRzLCBvciBpbiB0aGUgdXBzZXJ0IGNhc2UsIGFuIG9iamVjdFxuICAgIC8vIGNvbnRhaW5pbmcgdGhlIG51bWJlciBvZiBhZmZlY3RlZCBkb2NzIGFuZCB0aGUgaWQgb2YgdGhlIGRvYyB0aGF0IHdhc1xuICAgIC8vIGluc2VydGVkLCBpZiBhbnkuXG4gICAgbGV0IHJlc3VsdDtcbiAgICBpZiAob3B0aW9ucy5fcmV0dXJuT2JqZWN0KSB7XG4gICAgICByZXN1bHQgPSB7bnVtYmVyQWZmZWN0ZWQ6IHVwZGF0ZUNvdW50fTtcblxuICAgICAgaWYgKGluc2VydGVkSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXN1bHQuaW5zZXJ0ZWRJZCA9IGluc2VydGVkSWQ7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdCA9IHVwZGF0ZUNvdW50O1xuICAgIH1cblxuICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgTWV0ZW9yLmRlZmVyKCgpID0+IHtcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBBIGNvbnZlbmllbmNlIHdyYXBwZXIgb24gdXBkYXRlLiBMb2NhbENvbGxlY3Rpb24udXBzZXJ0KHNlbCwgbW9kKSBpc1xuICAvLyBlcXVpdmFsZW50IHRvIExvY2FsQ29sbGVjdGlvbi51cGRhdGUoc2VsLCBtb2QsIHt1cHNlcnQ6IHRydWUsXG4gIC8vIF9yZXR1cm5PYmplY3Q6IHRydWV9KS5cbiAgdXBzZXJ0KHNlbGVjdG9yLCBtb2QsIG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCFjYWxsYmFjayAmJiB0eXBlb2Ygb3B0aW9ucyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY2FsbGJhY2sgPSBvcHRpb25zO1xuICAgICAgb3B0aW9ucyA9IHt9O1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnVwZGF0ZShcbiAgICAgIHNlbGVjdG9yLFxuICAgICAgbW9kLFxuICAgICAgT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge3Vwc2VydDogdHJ1ZSwgX3JldHVybk9iamVjdDogdHJ1ZX0pLFxuICAgICAgY2FsbGJhY2tcbiAgICApO1xuICB9XG5cbiAgLy8gSXRlcmF0ZXMgb3ZlciBhIHN1YnNldCBvZiBkb2N1bWVudHMgdGhhdCBjb3VsZCBtYXRjaCBzZWxlY3RvcjsgY2FsbHNcbiAgLy8gZm4oZG9jLCBpZCkgb24gZWFjaCBvZiB0aGVtLiAgU3BlY2lmaWNhbGx5LCBpZiBzZWxlY3RvciBzcGVjaWZpZXNcbiAgLy8gc3BlY2lmaWMgX2lkJ3MsIGl0IG9ubHkgbG9va3MgYXQgdGhvc2UuICBkb2MgaXMgKm5vdCogY2xvbmVkOiBpdCBpcyB0aGVcbiAgLy8gc2FtZSBvYmplY3QgdGhhdCBpcyBpbiBfZG9jcy5cbiAgX2VhY2hQb3NzaWJseU1hdGNoaW5nRG9jKHNlbGVjdG9yLCBmbikge1xuICAgIGNvbnN0IHNwZWNpZmljSWRzID0gTG9jYWxDb2xsZWN0aW9uLl9pZHNNYXRjaGVkQnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cbiAgICBpZiAoc3BlY2lmaWNJZHMpIHtcbiAgICAgIHNwZWNpZmljSWRzLnNvbWUoaWQgPT4ge1xuICAgICAgICBjb25zdCBkb2MgPSB0aGlzLl9kb2NzLmdldChpZCk7XG5cbiAgICAgICAgaWYgKGRvYykge1xuICAgICAgICAgIHJldHVybiBmbihkb2MsIGlkKSA9PT0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9kb2NzLmZvckVhY2goZm4pO1xuICAgIH1cbiAgfVxuXG4gIF9tb2RpZnlBbmROb3RpZnkoZG9jLCBtb2QsIHJlY29tcHV0ZVFpZHMsIGFycmF5SW5kaWNlcykge1xuICAgIGNvbnN0IG1hdGNoZWRfYmVmb3JlID0ge307XG5cbiAgICBPYmplY3Qua2V5cyh0aGlzLnF1ZXJpZXMpLmZvckVhY2gocWlkID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyaWVzW3FpZF07XG5cbiAgICAgIGlmIChxdWVyeS5kaXJ0eSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChxdWVyeS5vcmRlcmVkKSB7XG4gICAgICAgIG1hdGNoZWRfYmVmb3JlW3FpZF0gPSBxdWVyeS5tYXRjaGVyLmRvY3VtZW50TWF0Y2hlcyhkb2MpLnJlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEJlY2F1c2Ugd2UgZG9uJ3Qgc3VwcG9ydCBza2lwIG9yIGxpbWl0ICh5ZXQpIGluIHVub3JkZXJlZCBxdWVyaWVzLCB3ZVxuICAgICAgICAvLyBjYW4ganVzdCBkbyBhIGRpcmVjdCBsb29rdXAuXG4gICAgICAgIG1hdGNoZWRfYmVmb3JlW3FpZF0gPSBxdWVyeS5yZXN1bHRzLmhhcyhkb2MuX2lkKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IG9sZF9kb2MgPSBFSlNPTi5jbG9uZShkb2MpO1xuXG4gICAgTG9jYWxDb2xsZWN0aW9uLl9tb2RpZnkoZG9jLCBtb2QsIHthcnJheUluZGljZXN9KTtcblxuICAgIE9iamVjdC5rZXlzKHRoaXMucXVlcmllcykuZm9yRWFjaChxaWQgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJpZXNbcWlkXTtcblxuICAgICAgaWYgKHF1ZXJ5LmRpcnR5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWZ0ZXJNYXRjaCA9IHF1ZXJ5Lm1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGRvYyk7XG4gICAgICBjb25zdCBhZnRlciA9IGFmdGVyTWF0Y2gucmVzdWx0O1xuICAgICAgY29uc3QgYmVmb3JlID0gbWF0Y2hlZF9iZWZvcmVbcWlkXTtcblxuICAgICAgaWYgKGFmdGVyICYmIHF1ZXJ5LmRpc3RhbmNlcyAmJiBhZnRlck1hdGNoLmRpc3RhbmNlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcXVlcnkuZGlzdGFuY2VzLnNldChkb2MuX2lkLCBhZnRlck1hdGNoLmRpc3RhbmNlKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHF1ZXJ5LmN1cnNvci5za2lwIHx8IHF1ZXJ5LmN1cnNvci5saW1pdCkge1xuICAgICAgICAvLyBXZSBuZWVkIHRvIHJlY29tcHV0ZSBhbnkgcXVlcnkgd2hlcmUgdGhlIGRvYyBtYXkgaGF2ZSBiZWVuIGluIHRoZVxuICAgICAgICAvLyBjdXJzb3IncyB3aW5kb3cgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgdXBkYXRlLiAoTm90ZSB0aGF0IGlmIHNraXBcbiAgICAgICAgLy8gb3IgbGltaXQgaXMgc2V0LCBcImJlZm9yZVwiIGFuZCBcImFmdGVyXCIgYmVpbmcgdHJ1ZSBkbyBub3QgbmVjZXNzYXJpbHlcbiAgICAgICAgLy8gbWVhbiB0aGF0IHRoZSBkb2N1bWVudCBpcyBpbiB0aGUgY3Vyc29yJ3Mgb3V0cHV0IGFmdGVyIHNraXAvbGltaXQgaXNcbiAgICAgICAgLy8gYXBwbGllZC4uLiBidXQgaWYgdGhleSBhcmUgZmFsc2UsIHRoZW4gdGhlIGRvY3VtZW50IGRlZmluaXRlbHkgaXMgTk9UXG4gICAgICAgIC8vIGluIHRoZSBvdXRwdXQuIFNvIGl0J3Mgc2FmZSB0byBza2lwIHJlY29tcHV0ZSBpZiBuZWl0aGVyIGJlZm9yZSBvclxuICAgICAgICAvLyBhZnRlciBhcmUgdHJ1ZS4pXG4gICAgICAgIGlmIChiZWZvcmUgfHwgYWZ0ZXIpIHtcbiAgICAgICAgICByZWNvbXB1dGVRaWRzW3FpZF0gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGJlZm9yZSAmJiAhYWZ0ZXIpIHtcbiAgICAgICAgTG9jYWxDb2xsZWN0aW9uLl9yZW1vdmVGcm9tUmVzdWx0cyhxdWVyeSwgZG9jKTtcbiAgICAgIH0gZWxzZSBpZiAoIWJlZm9yZSAmJiBhZnRlcikge1xuICAgICAgICBMb2NhbENvbGxlY3Rpb24uX2luc2VydEluUmVzdWx0cyhxdWVyeSwgZG9jKTtcbiAgICAgIH0gZWxzZSBpZiAoYmVmb3JlICYmIGFmdGVyKSB7XG4gICAgICAgIExvY2FsQ29sbGVjdGlvbi5fdXBkYXRlSW5SZXN1bHRzKHF1ZXJ5LCBkb2MsIG9sZF9kb2MpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gUmVjb21wdXRlcyB0aGUgcmVzdWx0cyBvZiBhIHF1ZXJ5IGFuZCBydW5zIG9ic2VydmUgY2FsbGJhY2tzIGZvciB0aGVcbiAgLy8gZGlmZmVyZW5jZSBiZXR3ZWVuIHRoZSBwcmV2aW91cyByZXN1bHRzIGFuZCB0aGUgY3VycmVudCByZXN1bHRzICh1bmxlc3NcbiAgLy8gcGF1c2VkKS4gVXNlZCBmb3Igc2tpcC9saW1pdCBxdWVyaWVzLlxuICAvL1xuICAvLyBXaGVuIHRoaXMgaXMgdXNlZCBieSBpbnNlcnQgb3IgcmVtb3ZlLCBpdCBjYW4ganVzdCB1c2UgcXVlcnkucmVzdWx0cyBmb3JcbiAgLy8gdGhlIG9sZCByZXN1bHRzIChhbmQgdGhlcmUncyBubyBuZWVkIHRvIHBhc3MgaW4gb2xkUmVzdWx0cyksIGJlY2F1c2UgdGhlc2VcbiAgLy8gb3BlcmF0aW9ucyBkb24ndCBtdXRhdGUgdGhlIGRvY3VtZW50cyBpbiB0aGUgY29sbGVjdGlvbi4gVXBkYXRlIG5lZWRzIHRvXG4gIC8vIHBhc3MgaW4gYW4gb2xkUmVzdWx0cyB3aGljaCB3YXMgZGVlcC1jb3BpZWQgYmVmb3JlIHRoZSBtb2RpZmllciB3YXNcbiAgLy8gYXBwbGllZC5cbiAgLy9cbiAgLy8gb2xkUmVzdWx0cyBpcyBndWFyYW50ZWVkIHRvIGJlIGlnbm9yZWQgaWYgdGhlIHF1ZXJ5IGlzIG5vdCBwYXVzZWQuXG4gIF9yZWNvbXB1dGVSZXN1bHRzKHF1ZXJ5LCBvbGRSZXN1bHRzKSB7XG4gICAgaWYgKHRoaXMucGF1c2VkKSB7XG4gICAgICAvLyBUaGVyZSdzIG5vIHJlYXNvbiB0byByZWNvbXB1dGUgdGhlIHJlc3VsdHMgbm93IGFzIHdlJ3JlIHN0aWxsIHBhdXNlZC5cbiAgICAgIC8vIEJ5IGZsYWdnaW5nIHRoZSBxdWVyeSBhcyBcImRpcnR5XCIsIHRoZSByZWNvbXB1dGUgd2lsbCBiZSBwZXJmb3JtZWRcbiAgICAgIC8vIHdoZW4gcmVzdW1lT2JzZXJ2ZXJzIGlzIGNhbGxlZC5cbiAgICAgIHF1ZXJ5LmRpcnR5ID0gdHJ1ZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMucGF1c2VkICYmICFvbGRSZXN1bHRzKSB7XG4gICAgICBvbGRSZXN1bHRzID0gcXVlcnkucmVzdWx0cztcbiAgICB9XG5cbiAgICBpZiAocXVlcnkuZGlzdGFuY2VzKSB7XG4gICAgICBxdWVyeS5kaXN0YW5jZXMuY2xlYXIoKTtcbiAgICB9XG5cbiAgICBxdWVyeS5yZXN1bHRzID0gcXVlcnkuY3Vyc29yLl9nZXRSYXdPYmplY3RzKHtcbiAgICAgIGRpc3RhbmNlczogcXVlcnkuZGlzdGFuY2VzLFxuICAgICAgb3JkZXJlZDogcXVlcnkub3JkZXJlZFxuICAgIH0pO1xuXG4gICAgaWYgKCF0aGlzLnBhdXNlZCkge1xuICAgICAgTG9jYWxDb2xsZWN0aW9uLl9kaWZmUXVlcnlDaGFuZ2VzKFxuICAgICAgICBxdWVyeS5vcmRlcmVkLFxuICAgICAgICBvbGRSZXN1bHRzLFxuICAgICAgICBxdWVyeS5yZXN1bHRzLFxuICAgICAgICBxdWVyeSxcbiAgICAgICAge3Byb2plY3Rpb25GbjogcXVlcnkucHJvamVjdGlvbkZufVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfc2F2ZU9yaWdpbmFsKGlkLCBkb2MpIHtcbiAgICAvLyBBcmUgd2UgZXZlbiB0cnlpbmcgdG8gc2F2ZSBvcmlnaW5hbHM/XG4gICAgaWYgKCF0aGlzLl9zYXZlZE9yaWdpbmFscykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEhhdmUgd2UgcHJldmlvdXNseSBtdXRhdGVkIHRoZSBvcmlnaW5hbCAoYW5kIHNvICdkb2MnIGlzIG5vdCBhY3R1YWxseVxuICAgIC8vIG9yaWdpbmFsKT8gIChOb3RlIHRoZSAnaGFzJyBjaGVjayByYXRoZXIgdGhhbiB0cnV0aDogd2Ugc3RvcmUgdW5kZWZpbmVkXG4gICAgLy8gaGVyZSBmb3IgaW5zZXJ0ZWQgZG9jcyEpXG4gICAgaWYgKHRoaXMuX3NhdmVkT3JpZ2luYWxzLmhhcyhpZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLl9zYXZlZE9yaWdpbmFscy5zZXQoaWQsIEVKU09OLmNsb25lKGRvYykpO1xuICB9XG59XG5cbkxvY2FsQ29sbGVjdGlvbi5DdXJzb3IgPSBDdXJzb3I7XG5cbkxvY2FsQ29sbGVjdGlvbi5PYnNlcnZlSGFuZGxlID0gT2JzZXJ2ZUhhbmRsZTtcblxuLy8gWFhYIG1heWJlIG1vdmUgdGhlc2UgaW50byBhbm90aGVyIE9ic2VydmVIZWxwZXJzIHBhY2thZ2Ugb3Igc29tZXRoaW5nXG5cbi8vIF9DYWNoaW5nQ2hhbmdlT2JzZXJ2ZXIgaXMgYW4gb2JqZWN0IHdoaWNoIHJlY2VpdmVzIG9ic2VydmVDaGFuZ2VzIGNhbGxiYWNrc1xuLy8gYW5kIGtlZXBzIGEgY2FjaGUgb2YgdGhlIGN1cnJlbnQgY3Vyc29yIHN0YXRlIHVwIHRvIGRhdGUgaW4gdGhpcy5kb2NzLiBVc2Vyc1xuLy8gb2YgdGhpcyBjbGFzcyBzaG91bGQgcmVhZCB0aGUgZG9jcyBmaWVsZCBidXQgbm90IG1vZGlmeSBpdC4gWW91IHNob3VsZCBwYXNzXG4vLyB0aGUgXCJhcHBseUNoYW5nZVwiIGZpZWxkIGFzIHRoZSBjYWxsYmFja3MgdG8gdGhlIHVuZGVybHlpbmcgb2JzZXJ2ZUNoYW5nZXNcbi8vIGNhbGwuIE9wdGlvbmFsbHksIHlvdSBjYW4gc3BlY2lmeSB5b3VyIG93biBvYnNlcnZlQ2hhbmdlcyBjYWxsYmFja3Mgd2hpY2ggYXJlXG4vLyBpbnZva2VkIGltbWVkaWF0ZWx5IGJlZm9yZSB0aGUgZG9jcyBmaWVsZCBpcyB1cGRhdGVkOyB0aGlzIG9iamVjdCBpcyBtYWRlXG4vLyBhdmFpbGFibGUgYXMgYHRoaXNgIHRvIHRob3NlIGNhbGxiYWNrcy5cbkxvY2FsQ29sbGVjdGlvbi5fQ2FjaGluZ0NoYW5nZU9ic2VydmVyID0gY2xhc3MgX0NhY2hpbmdDaGFuZ2VPYnNlcnZlciB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IG9yZGVyZWRGcm9tQ2FsbGJhY2tzID0gKFxuICAgICAgb3B0aW9ucy5jYWxsYmFja3MgJiZcbiAgICAgIExvY2FsQ29sbGVjdGlvbi5fb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3NBcmVPcmRlcmVkKG9wdGlvbnMuY2FsbGJhY2tzKVxuICAgICk7XG5cbiAgICBpZiAoaGFzT3duLmNhbGwob3B0aW9ucywgJ29yZGVyZWQnKSkge1xuICAgICAgdGhpcy5vcmRlcmVkID0gb3B0aW9ucy5vcmRlcmVkO1xuXG4gICAgICBpZiAob3B0aW9ucy5jYWxsYmFja3MgJiYgb3B0aW9ucy5vcmRlcmVkICE9PSBvcmRlcmVkRnJvbUNhbGxiYWNrcykge1xuICAgICAgICB0aHJvdyBFcnJvcignb3JkZXJlZCBvcHRpb24gZG9lc25cXCd0IG1hdGNoIGNhbGxiYWNrcycpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5jYWxsYmFja3MpIHtcbiAgICAgIHRoaXMub3JkZXJlZCA9IG9yZGVyZWRGcm9tQ2FsbGJhY2tzO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBFcnJvcignbXVzdCBwcm92aWRlIG9yZGVyZWQgb3IgY2FsbGJhY2tzJyk7XG4gICAgfVxuXG4gICAgY29uc3QgY2FsbGJhY2tzID0gb3B0aW9ucy5jYWxsYmFja3MgfHwge307XG5cbiAgICBpZiAodGhpcy5vcmRlcmVkKSB7XG4gICAgICB0aGlzLmRvY3MgPSBuZXcgT3JkZXJlZERpY3QoTW9uZ29JRC5pZFN0cmluZ2lmeSk7XG4gICAgICB0aGlzLmFwcGx5Q2hhbmdlID0ge1xuICAgICAgICBhZGRlZEJlZm9yZTogKGlkLCBmaWVsZHMsIGJlZm9yZSkgPT4ge1xuICAgICAgICAgIC8vIFRha2UgYSBzaGFsbG93IGNvcHkgc2luY2UgdGhlIHRvcC1sZXZlbCBwcm9wZXJ0aWVzIGNhbiBiZSBjaGFuZ2VkXG4gICAgICAgICAgY29uc3QgZG9jID0geyAuLi5maWVsZHMgfTtcblxuICAgICAgICAgIGRvYy5faWQgPSBpZDtcblxuICAgICAgICAgIGlmIChjYWxsYmFja3MuYWRkZWRCZWZvcmUpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrcy5hZGRlZEJlZm9yZS5jYWxsKHRoaXMsIGlkLCBFSlNPTi5jbG9uZShmaWVsZHMpLCBiZWZvcmUpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFRoaXMgbGluZSB0cmlnZ2VycyBpZiB3ZSBwcm92aWRlIGFkZGVkIHdpdGggbW92ZWRCZWZvcmUuXG4gICAgICAgICAgaWYgKGNhbGxiYWNrcy5hZGRlZCkge1xuICAgICAgICAgICAgY2FsbGJhY2tzLmFkZGVkLmNhbGwodGhpcywgaWQsIEVKU09OLmNsb25lKGZpZWxkcykpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFhYWCBjb3VsZCBgYmVmb3JlYCBiZSBhIGZhbHN5IElEPyAgVGVjaG5pY2FsbHlcbiAgICAgICAgICAvLyBpZFN0cmluZ2lmeSBzZWVtcyB0byBhbGxvdyBmb3IgdGhlbSAtLSB0aG91Z2hcbiAgICAgICAgICAvLyBPcmRlcmVkRGljdCB3b24ndCBjYWxsIHN0cmluZ2lmeSBvbiBhIGZhbHN5IGFyZy5cbiAgICAgICAgICB0aGlzLmRvY3MucHV0QmVmb3JlKGlkLCBkb2MsIGJlZm9yZSB8fCBudWxsKTtcbiAgICAgICAgfSxcbiAgICAgICAgbW92ZWRCZWZvcmU6IChpZCwgYmVmb3JlKSA9PiB7XG4gICAgICAgICAgY29uc3QgZG9jID0gdGhpcy5kb2NzLmdldChpZCk7XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tzLm1vdmVkQmVmb3JlKSB7XG4gICAgICAgICAgICBjYWxsYmFja3MubW92ZWRCZWZvcmUuY2FsbCh0aGlzLCBpZCwgYmVmb3JlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLmRvY3MubW92ZUJlZm9yZShpZCwgYmVmb3JlIHx8IG51bGwpO1xuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5kb2NzID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gICAgICB0aGlzLmFwcGx5Q2hhbmdlID0ge1xuICAgICAgICBhZGRlZDogKGlkLCBmaWVsZHMpID0+IHtcbiAgICAgICAgICAvLyBUYWtlIGEgc2hhbGxvdyBjb3B5IHNpbmNlIHRoZSB0b3AtbGV2ZWwgcHJvcGVydGllcyBjYW4gYmUgY2hhbmdlZFxuICAgICAgICAgIGNvbnN0IGRvYyA9IHsgLi4uZmllbGRzIH07XG5cbiAgICAgICAgICBpZiAoY2FsbGJhY2tzLmFkZGVkKSB7XG4gICAgICAgICAgICBjYWxsYmFja3MuYWRkZWQuY2FsbCh0aGlzLCBpZCwgRUpTT04uY2xvbmUoZmllbGRzKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZG9jLl9pZCA9IGlkO1xuXG4gICAgICAgICAgdGhpcy5kb2NzLnNldChpZCwgIGRvYyk7XG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFRoZSBtZXRob2RzIGluIF9JZE1hcCBhbmQgT3JkZXJlZERpY3QgdXNlZCBieSB0aGVzZSBjYWxsYmFja3MgYXJlXG4gICAgLy8gaWRlbnRpY2FsLlxuICAgIHRoaXMuYXBwbHlDaGFuZ2UuY2hhbmdlZCA9IChpZCwgZmllbGRzKSA9PiB7XG4gICAgICBjb25zdCBkb2MgPSB0aGlzLmRvY3MuZ2V0KGlkKTtcblxuICAgICAgaWYgKCFkb2MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGlkIGZvciBjaGFuZ2VkOiAke2lkfWApO1xuICAgICAgfVxuXG4gICAgICBpZiAoY2FsbGJhY2tzLmNoYW5nZWQpIHtcbiAgICAgICAgY2FsbGJhY2tzLmNoYW5nZWQuY2FsbCh0aGlzLCBpZCwgRUpTT04uY2xvbmUoZmllbGRzKSk7XG4gICAgICB9XG5cbiAgICAgIERpZmZTZXF1ZW5jZS5hcHBseUNoYW5nZXMoZG9jLCBmaWVsZHMpO1xuICAgIH07XG5cbiAgICB0aGlzLmFwcGx5Q2hhbmdlLnJlbW92ZWQgPSBpZCA9PiB7XG4gICAgICBpZiAoY2FsbGJhY2tzLnJlbW92ZWQpIHtcbiAgICAgICAgY2FsbGJhY2tzLnJlbW92ZWQuY2FsbCh0aGlzLCBpZCk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuZG9jcy5yZW1vdmUoaWQpO1xuICAgIH07XG4gIH1cbn07XG5cbkxvY2FsQ29sbGVjdGlvbi5fSWRNYXAgPSBjbGFzcyBfSWRNYXAgZXh0ZW5kcyBJZE1hcCB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKE1vbmdvSUQuaWRTdHJpbmdpZnksIE1vbmdvSUQuaWRQYXJzZSk7XG4gIH1cbn07XG5cbi8vIFdyYXAgYSB0cmFuc2Zvcm0gZnVuY3Rpb24gdG8gcmV0dXJuIG9iamVjdHMgdGhhdCBoYXZlIHRoZSBfaWQgZmllbGRcbi8vIG9mIHRoZSB1bnRyYW5zZm9ybWVkIGRvY3VtZW50LiBUaGlzIGVuc3VyZXMgdGhhdCBzdWJzeXN0ZW1zIHN1Y2ggYXNcbi8vIHRoZSBvYnNlcnZlLXNlcXVlbmNlIHBhY2thZ2UgdGhhdCBjYWxsIGBvYnNlcnZlYCBjYW4ga2VlcCB0cmFjayBvZlxuLy8gdGhlIGRvY3VtZW50cyBpZGVudGl0aWVzLlxuLy9cbi8vIC0gUmVxdWlyZSB0aGF0IGl0IHJldHVybnMgb2JqZWN0c1xuLy8gLSBJZiB0aGUgcmV0dXJuIHZhbHVlIGhhcyBhbiBfaWQgZmllbGQsIHZlcmlmeSB0aGF0IGl0IG1hdGNoZXMgdGhlXG4vLyAgIG9yaWdpbmFsIF9pZCBmaWVsZFxuLy8gLSBJZiB0aGUgcmV0dXJuIHZhbHVlIGRvZXNuJ3QgaGF2ZSBhbiBfaWQgZmllbGQsIGFkZCBpdCBiYWNrLlxuTG9jYWxDb2xsZWN0aW9uLndyYXBUcmFuc2Zvcm0gPSB0cmFuc2Zvcm0gPT4ge1xuICBpZiAoIXRyYW5zZm9ybSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gTm8gbmVlZCB0byBkb3VibHktd3JhcCB0cmFuc2Zvcm1zLlxuICBpZiAodHJhbnNmb3JtLl9fd3JhcHBlZFRyYW5zZm9ybV9fKSB7XG4gICAgcmV0dXJuIHRyYW5zZm9ybTtcbiAgfVxuXG4gIGNvbnN0IHdyYXBwZWQgPSBkb2MgPT4ge1xuICAgIGlmICghaGFzT3duLmNhbGwoZG9jLCAnX2lkJykpIHtcbiAgICAgIC8vIFhYWCBkbyB3ZSBldmVyIGhhdmUgYSB0cmFuc2Zvcm0gb24gdGhlIG9wbG9nJ3MgY29sbGVjdGlvbj8gYmVjYXVzZSB0aGF0XG4gICAgICAvLyBjb2xsZWN0aW9uIGhhcyBubyBfaWQuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbiBvbmx5IHRyYW5zZm9ybSBkb2N1bWVudHMgd2l0aCBfaWQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBpZCA9IGRvYy5faWQ7XG5cbiAgICAvLyBYWFggY29uc2lkZXIgbWFraW5nIHRyYWNrZXIgYSB3ZWFrIGRlcGVuZGVuY3kgYW5kIGNoZWNraW5nXG4gICAgLy8gUGFja2FnZS50cmFja2VyIGhlcmVcbiAgICBjb25zdCB0cmFuc2Zvcm1lZCA9IFRyYWNrZXIubm9ucmVhY3RpdmUoKCkgPT4gdHJhbnNmb3JtKGRvYykpO1xuXG4gICAgaWYgKCFMb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3QodHJhbnNmb3JtZWQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3RyYW5zZm9ybSBtdXN0IHJldHVybiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoaGFzT3duLmNhbGwodHJhbnNmb3JtZWQsICdfaWQnKSkge1xuICAgICAgaWYgKCFFSlNPTi5lcXVhbHModHJhbnNmb3JtZWQuX2lkLCBpZCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd0cmFuc2Zvcm1lZCBkb2N1bWVudCBjYW5cXCd0IGhhdmUgZGlmZmVyZW50IF9pZCcpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0cmFuc2Zvcm1lZC5faWQgPSBpZDtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJhbnNmb3JtZWQ7XG4gIH07XG5cbiAgd3JhcHBlZC5fX3dyYXBwZWRUcmFuc2Zvcm1fXyA9IHRydWU7XG5cbiAgcmV0dXJuIHdyYXBwZWQ7XG59O1xuXG4vLyBYWFggdGhlIHNvcnRlZC1xdWVyeSBsb2dpYyBiZWxvdyBpcyBsYXVnaGFibHkgaW5lZmZpY2llbnQuIHdlJ2xsXG4vLyBuZWVkIHRvIGNvbWUgdXAgd2l0aCBhIGJldHRlciBkYXRhc3RydWN0dXJlIGZvciB0aGlzLlxuLy9cbi8vIFhYWCB0aGUgbG9naWMgZm9yIG9ic2VydmluZyB3aXRoIGEgc2tpcCBvciBhIGxpbWl0IGlzIGV2ZW4gbW9yZVxuLy8gbGF1Z2hhYmx5IGluZWZmaWNpZW50LiB3ZSByZWNvbXB1dGUgdGhlIHdob2xlIHJlc3VsdHMgZXZlcnkgdGltZSFcblxuLy8gVGhpcyBiaW5hcnkgc2VhcmNoIHB1dHMgYSB2YWx1ZSBiZXR3ZWVuIGFueSBlcXVhbCB2YWx1ZXMsIGFuZCB0aGUgZmlyc3Rcbi8vIGxlc3NlciB2YWx1ZS5cbkxvY2FsQ29sbGVjdGlvbi5fYmluYXJ5U2VhcmNoID0gKGNtcCwgYXJyYXksIHZhbHVlKSA9PiB7XG4gIGxldCBmaXJzdCA9IDA7XG4gIGxldCByYW5nZSA9IGFycmF5Lmxlbmd0aDtcblxuICB3aGlsZSAocmFuZ2UgPiAwKSB7XG4gICAgY29uc3QgaGFsZlJhbmdlID0gTWF0aC5mbG9vcihyYW5nZSAvIDIpO1xuXG4gICAgaWYgKGNtcCh2YWx1ZSwgYXJyYXlbZmlyc3QgKyBoYWxmUmFuZ2VdKSA+PSAwKSB7XG4gICAgICBmaXJzdCArPSBoYWxmUmFuZ2UgKyAxO1xuICAgICAgcmFuZ2UgLT0gaGFsZlJhbmdlICsgMTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmFuZ2UgPSBoYWxmUmFuZ2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZpcnN0O1xufTtcblxuTG9jYWxDb2xsZWN0aW9uLl9jaGVja1N1cHBvcnRlZFByb2plY3Rpb24gPSBmaWVsZHMgPT4ge1xuICBpZiAoZmllbGRzICE9PSBPYmplY3QoZmllbGRzKSB8fCBBcnJheS5pc0FycmF5KGZpZWxkcykpIHtcbiAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignZmllbGRzIG9wdGlvbiBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICB9XG5cbiAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGtleVBhdGggPT4ge1xuICAgIGlmIChrZXlQYXRoLnNwbGl0KCcuJykuaW5jbHVkZXMoJyQnKSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICdNaW5pbW9uZ28gZG9lc25cXCd0IHN1cHBvcnQgJCBvcGVyYXRvciBpbiBwcm9qZWN0aW9ucyB5ZXQuJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB2YWx1ZSA9IGZpZWxkc1trZXlQYXRoXTtcblxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIFsnJGVsZW1NYXRjaCcsICckbWV0YScsICckc2xpY2UnXS5zb21lKGtleSA9PlxuICAgICAgICAgIGhhc093bi5jYWxsKHZhbHVlLCBrZXkpXG4gICAgICAgICkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAnTWluaW1vbmdvIGRvZXNuXFwndCBzdXBwb3J0IG9wZXJhdG9ycyBpbiBwcm9qZWN0aW9ucyB5ZXQuJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoIVsxLCAwLCB0cnVlLCBmYWxzZV0uaW5jbHVkZXModmFsdWUpKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgJ1Byb2plY3Rpb24gdmFsdWVzIHNob3VsZCBiZSBvbmUgb2YgMSwgMCwgdHJ1ZSwgb3IgZmFsc2UnXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBLbm93cyBob3cgdG8gY29tcGlsZSBhIGZpZWxkcyBwcm9qZWN0aW9uIHRvIGEgcHJlZGljYXRlIGZ1bmN0aW9uLlxuLy8gQHJldHVybnMgLSBGdW5jdGlvbjogYSBjbG9zdXJlIHRoYXQgZmlsdGVycyBvdXQgYW4gb2JqZWN0IGFjY29yZGluZyB0byB0aGVcbi8vICAgICAgICAgICAgZmllbGRzIHByb2plY3Rpb24gcnVsZXM6XG4vLyAgICAgICAgICAgIEBwYXJhbSBvYmogLSBPYmplY3Q6IE1vbmdvREItc3R5bGVkIGRvY3VtZW50XG4vLyAgICAgICAgICAgIEByZXR1cm5zIC0gT2JqZWN0OiBhIGRvY3VtZW50IHdpdGggdGhlIGZpZWxkcyBmaWx0ZXJlZCBvdXRcbi8vICAgICAgICAgICAgICAgICAgICAgICBhY2NvcmRpbmcgdG8gcHJvamVjdGlvbiBydWxlcy4gRG9lc24ndCByZXRhaW4gc3ViZmllbGRzXG4vLyAgICAgICAgICAgICAgICAgICAgICAgb2YgcGFzc2VkIGFyZ3VtZW50LlxuTG9jYWxDb2xsZWN0aW9uLl9jb21waWxlUHJvamVjdGlvbiA9IGZpZWxkcyA9PiB7XG4gIExvY2FsQ29sbGVjdGlvbi5fY2hlY2tTdXBwb3J0ZWRQcm9qZWN0aW9uKGZpZWxkcyk7XG5cbiAgY29uc3QgX2lkUHJvamVjdGlvbiA9IGZpZWxkcy5faWQgPT09IHVuZGVmaW5lZCA/IHRydWUgOiBmaWVsZHMuX2lkO1xuICBjb25zdCBkZXRhaWxzID0gcHJvamVjdGlvbkRldGFpbHMoZmllbGRzKTtcblxuICAvLyByZXR1cm5zIHRyYW5zZm9ybWVkIGRvYyBhY2NvcmRpbmcgdG8gcnVsZVRyZWVcbiAgY29uc3QgdHJhbnNmb3JtID0gKGRvYywgcnVsZVRyZWUpID0+IHtcbiAgICAvLyBTcGVjaWFsIGNhc2UgZm9yIFwic2V0c1wiXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZG9jKSkge1xuICAgICAgcmV0dXJuIGRvYy5tYXAoc3ViZG9jID0+IHRyYW5zZm9ybShzdWJkb2MsIHJ1bGVUcmVlKSk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gZGV0YWlscy5pbmNsdWRpbmcgPyB7fSA6IEVKU09OLmNsb25lKGRvYyk7XG5cbiAgICBPYmplY3Qua2V5cyhydWxlVHJlZSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGRvYyA9PSBudWxsIHx8ICFoYXNPd24uY2FsbChkb2MsIGtleSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBydWxlID0gcnVsZVRyZWVba2V5XTtcblxuICAgICAgaWYgKHJ1bGUgPT09IE9iamVjdChydWxlKSkge1xuICAgICAgICAvLyBGb3Igc3ViLW9iamVjdHMvc3Vic2V0cyB3ZSBicmFuY2hcbiAgICAgICAgaWYgKGRvY1trZXldID09PSBPYmplY3QoZG9jW2tleV0pKSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSB0cmFuc2Zvcm0oZG9jW2tleV0sIHJ1bGUpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGRldGFpbHMuaW5jbHVkaW5nKSB7XG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSBkb24ndCBldmVuIHRvdWNoIHRoaXMgc3ViZmllbGRcbiAgICAgICAgcmVzdWx0W2tleV0gPSBFSlNPTi5jbG9uZShkb2Nba2V5XSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gZG9jICE9IG51bGwgPyByZXN1bHQgOiBkb2M7XG4gIH07XG5cbiAgcmV0dXJuIGRvYyA9PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNmb3JtKGRvYywgZGV0YWlscy50cmVlKTtcblxuICAgIGlmIChfaWRQcm9qZWN0aW9uICYmIGhhc093bi5jYWxsKGRvYywgJ19pZCcpKSB7XG4gICAgICByZXN1bHQuX2lkID0gZG9jLl9pZDtcbiAgICB9XG5cbiAgICBpZiAoIV9pZFByb2plY3Rpb24gJiYgaGFzT3duLmNhbGwocmVzdWx0LCAnX2lkJykpIHtcbiAgICAgIGRlbGV0ZSByZXN1bHQuX2lkO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG59O1xuXG4vLyBDYWxjdWxhdGVzIHRoZSBkb2N1bWVudCB0byBpbnNlcnQgaW4gY2FzZSB3ZSdyZSBkb2luZyBhbiB1cHNlcnQgYW5kIHRoZVxuLy8gc2VsZWN0b3IgZG9lcyBub3QgbWF0Y2ggYW55IGVsZW1lbnRzXG5Mb2NhbENvbGxlY3Rpb24uX2NyZWF0ZVVwc2VydERvY3VtZW50ID0gKHNlbGVjdG9yLCBtb2RpZmllcikgPT4ge1xuICBjb25zdCBzZWxlY3RvckRvY3VtZW50ID0gcG9wdWxhdGVEb2N1bWVudFdpdGhRdWVyeUZpZWxkcyhzZWxlY3Rvcik7XG4gIGNvbnN0IGlzTW9kaWZ5ID0gTG9jYWxDb2xsZWN0aW9uLl9pc01vZGlmaWNhdGlvbk1vZChtb2RpZmllcik7XG5cbiAgY29uc3QgbmV3RG9jID0ge307XG5cbiAgaWYgKHNlbGVjdG9yRG9jdW1lbnQuX2lkKSB7XG4gICAgbmV3RG9jLl9pZCA9IHNlbGVjdG9yRG9jdW1lbnQuX2lkO1xuICAgIGRlbGV0ZSBzZWxlY3RvckRvY3VtZW50Ll9pZDtcbiAgfVxuXG4gIC8vIFRoaXMgZG91YmxlIF9tb2RpZnkgY2FsbCBpcyBtYWRlIHRvIGhlbHAgd2l0aCBuZXN0ZWQgcHJvcGVydGllcyAoc2VlIGlzc3VlXG4gIC8vICM4NjMxKS4gV2UgZG8gdGhpcyBldmVuIGlmIGl0J3MgYSByZXBsYWNlbWVudCBmb3IgdmFsaWRhdGlvbiBwdXJwb3NlcyAoZS5nLlxuICAvLyBhbWJpZ3VvdXMgaWQncylcbiAgTG9jYWxDb2xsZWN0aW9uLl9tb2RpZnkobmV3RG9jLCB7JHNldDogc2VsZWN0b3JEb2N1bWVudH0pO1xuICBMb2NhbENvbGxlY3Rpb24uX21vZGlmeShuZXdEb2MsIG1vZGlmaWVyLCB7aXNJbnNlcnQ6IHRydWV9KTtcblxuICBpZiAoaXNNb2RpZnkpIHtcbiAgICByZXR1cm4gbmV3RG9jO1xuICB9XG5cbiAgLy8gUmVwbGFjZW1lbnQgY2FuIHRha2UgX2lkIGZyb20gcXVlcnkgZG9jdW1lbnRcbiAgY29uc3QgcmVwbGFjZW1lbnQgPSBPYmplY3QuYXNzaWduKHt9LCBtb2RpZmllcik7XG4gIGlmIChuZXdEb2MuX2lkKSB7XG4gICAgcmVwbGFjZW1lbnQuX2lkID0gbmV3RG9jLl9pZDtcbiAgfVxuXG4gIHJldHVybiByZXBsYWNlbWVudDtcbn07XG5cbkxvY2FsQ29sbGVjdGlvbi5fZGlmZk9iamVjdHMgPSAobGVmdCwgcmlnaHQsIGNhbGxiYWNrcykgPT4ge1xuICByZXR1cm4gRGlmZlNlcXVlbmNlLmRpZmZPYmplY3RzKGxlZnQsIHJpZ2h0LCBjYWxsYmFja3MpO1xufTtcblxuLy8gb3JkZXJlZDogYm9vbC5cbi8vIG9sZF9yZXN1bHRzIGFuZCBuZXdfcmVzdWx0czogY29sbGVjdGlvbnMgb2YgZG9jdW1lbnRzLlxuLy8gICAgaWYgb3JkZXJlZCwgdGhleSBhcmUgYXJyYXlzLlxuLy8gICAgaWYgdW5vcmRlcmVkLCB0aGV5IGFyZSBJZE1hcHNcbkxvY2FsQ29sbGVjdGlvbi5fZGlmZlF1ZXJ5Q2hhbmdlcyA9IChvcmRlcmVkLCBvbGRSZXN1bHRzLCBuZXdSZXN1bHRzLCBvYnNlcnZlciwgb3B0aW9ucykgPT5cbiAgRGlmZlNlcXVlbmNlLmRpZmZRdWVyeUNoYW5nZXMob3JkZXJlZCwgb2xkUmVzdWx0cywgbmV3UmVzdWx0cywgb2JzZXJ2ZXIsIG9wdGlvbnMpXG47XG5cbkxvY2FsQ29sbGVjdGlvbi5fZGlmZlF1ZXJ5T3JkZXJlZENoYW5nZXMgPSAob2xkUmVzdWx0cywgbmV3UmVzdWx0cywgb2JzZXJ2ZXIsIG9wdGlvbnMpID0+XG4gIERpZmZTZXF1ZW5jZS5kaWZmUXVlcnlPcmRlcmVkQ2hhbmdlcyhvbGRSZXN1bHRzLCBuZXdSZXN1bHRzLCBvYnNlcnZlciwgb3B0aW9ucylcbjtcblxuTG9jYWxDb2xsZWN0aW9uLl9kaWZmUXVlcnlVbm9yZGVyZWRDaGFuZ2VzID0gKG9sZFJlc3VsdHMsIG5ld1Jlc3VsdHMsIG9ic2VydmVyLCBvcHRpb25zKSA9PlxuICBEaWZmU2VxdWVuY2UuZGlmZlF1ZXJ5VW5vcmRlcmVkQ2hhbmdlcyhvbGRSZXN1bHRzLCBuZXdSZXN1bHRzLCBvYnNlcnZlciwgb3B0aW9ucylcbjtcblxuTG9jYWxDb2xsZWN0aW9uLl9maW5kSW5PcmRlcmVkUmVzdWx0cyA9IChxdWVyeSwgZG9jKSA9PiB7XG4gIGlmICghcXVlcnkub3JkZXJlZCkge1xuICAgIHRocm93IG5ldyBFcnJvcignQ2FuXFwndCBjYWxsIF9maW5kSW5PcmRlcmVkUmVzdWx0cyBvbiB1bm9yZGVyZWQgcXVlcnknKTtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcnkucmVzdWx0cy5sZW5ndGg7IGkrKykge1xuICAgIGlmIChxdWVyeS5yZXN1bHRzW2ldID09PSBkb2MpIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxuXG4gIHRocm93IEVycm9yKCdvYmplY3QgbWlzc2luZyBmcm9tIHF1ZXJ5Jyk7XG59O1xuXG4vLyBJZiB0aGlzIGlzIGEgc2VsZWN0b3Igd2hpY2ggZXhwbGljaXRseSBjb25zdHJhaW5zIHRoZSBtYXRjaCBieSBJRCB0byBhIGZpbml0ZVxuLy8gbnVtYmVyIG9mIGRvY3VtZW50cywgcmV0dXJucyBhIGxpc3Qgb2YgdGhlaXIgSURzLiAgT3RoZXJ3aXNlIHJldHVybnNcbi8vIG51bGwuIE5vdGUgdGhhdCB0aGUgc2VsZWN0b3IgbWF5IGhhdmUgb3RoZXIgcmVzdHJpY3Rpb25zIHNvIGl0IG1heSBub3QgZXZlblxuLy8gbWF0Y2ggdGhvc2UgZG9jdW1lbnQhICBXZSBjYXJlIGFib3V0ICRpbiBhbmQgJGFuZCBzaW5jZSB0aG9zZSBhcmUgZ2VuZXJhdGVkXG4vLyBhY2Nlc3MtY29udHJvbGxlZCB1cGRhdGUgYW5kIHJlbW92ZS5cbkxvY2FsQ29sbGVjdGlvbi5faWRzTWF0Y2hlZEJ5U2VsZWN0b3IgPSBzZWxlY3RvciA9PiB7XG4gIC8vIElzIHRoZSBzZWxlY3RvciBqdXN0IGFuIElEP1xuICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWQoc2VsZWN0b3IpKSB7XG4gICAgcmV0dXJuIFtzZWxlY3Rvcl07XG4gIH1cblxuICBpZiAoIXNlbGVjdG9yKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBEbyB3ZSBoYXZlIGFuIF9pZCBjbGF1c2U/XG4gIGlmIChoYXNPd24uY2FsbChzZWxlY3RvciwgJ19pZCcpKSB7XG4gICAgLy8gSXMgdGhlIF9pZCBjbGF1c2UganVzdCBhbiBJRD9cbiAgICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWQoc2VsZWN0b3IuX2lkKSkge1xuICAgICAgcmV0dXJuIFtzZWxlY3Rvci5faWRdO1xuICAgIH1cblxuICAgIC8vIElzIHRoZSBfaWQgY2xhdXNlIHtfaWQ6IHskaW46IFtcInhcIiwgXCJ5XCIsIFwielwiXX19P1xuICAgIGlmIChzZWxlY3Rvci5faWRcbiAgICAgICAgJiYgQXJyYXkuaXNBcnJheShzZWxlY3Rvci5faWQuJGluKVxuICAgICAgICAmJiBzZWxlY3Rvci5faWQuJGluLmxlbmd0aFxuICAgICAgICAmJiBzZWxlY3Rvci5faWQuJGluLmV2ZXJ5KExvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkKSkge1xuICAgICAgcmV0dXJuIHNlbGVjdG9yLl9pZC4kaW47XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBJZiB0aGlzIGlzIGEgdG9wLWxldmVsICRhbmQsIGFuZCBhbnkgb2YgdGhlIGNsYXVzZXMgY29uc3RyYWluIHRoZWlyXG4gIC8vIGRvY3VtZW50cywgdGhlbiB0aGUgd2hvbGUgc2VsZWN0b3IgaXMgY29uc3RyYWluZWQgYnkgYW55IG9uZSBjbGF1c2Unc1xuICAvLyBjb25zdHJhaW50LiAoV2VsbCwgYnkgdGhlaXIgaW50ZXJzZWN0aW9uLCBidXQgdGhhdCBzZWVtcyB1bmxpa2VseS4pXG4gIGlmIChBcnJheS5pc0FycmF5KHNlbGVjdG9yLiRhbmQpKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzZWxlY3Rvci4kYW5kLmxlbmd0aDsgKytpKSB7XG4gICAgICBjb25zdCBzdWJJZHMgPSBMb2NhbENvbGxlY3Rpb24uX2lkc01hdGNoZWRCeVNlbGVjdG9yKHNlbGVjdG9yLiRhbmRbaV0pO1xuXG4gICAgICBpZiAoc3ViSWRzKSB7XG4gICAgICAgIHJldHVybiBzdWJJZHM7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX2luc2VydEluUmVzdWx0cyA9IChxdWVyeSwgZG9jKSA9PiB7XG4gIGNvbnN0IGZpZWxkcyA9IEVKU09OLmNsb25lKGRvYyk7XG5cbiAgZGVsZXRlIGZpZWxkcy5faWQ7XG5cbiAgaWYgKHF1ZXJ5Lm9yZGVyZWQpIHtcbiAgICBpZiAoIXF1ZXJ5LnNvcnRlcikge1xuICAgICAgcXVlcnkuYWRkZWRCZWZvcmUoZG9jLl9pZCwgcXVlcnkucHJvamVjdGlvbkZuKGZpZWxkcyksIG51bGwpO1xuICAgICAgcXVlcnkucmVzdWx0cy5wdXNoKGRvYyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGkgPSBMb2NhbENvbGxlY3Rpb24uX2luc2VydEluU29ydGVkTGlzdChcbiAgICAgICAgcXVlcnkuc29ydGVyLmdldENvbXBhcmF0b3Ioe2Rpc3RhbmNlczogcXVlcnkuZGlzdGFuY2VzfSksXG4gICAgICAgIHF1ZXJ5LnJlc3VsdHMsXG4gICAgICAgIGRvY1xuICAgICAgKTtcblxuICAgICAgbGV0IG5leHQgPSBxdWVyeS5yZXN1bHRzW2kgKyAxXTtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIG5leHQgPSBuZXh0Ll9pZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5leHQgPSBudWxsO1xuICAgICAgfVxuXG4gICAgICBxdWVyeS5hZGRlZEJlZm9yZShkb2MuX2lkLCBxdWVyeS5wcm9qZWN0aW9uRm4oZmllbGRzKSwgbmV4dCk7XG4gICAgfVxuXG4gICAgcXVlcnkuYWRkZWQoZG9jLl9pZCwgcXVlcnkucHJvamVjdGlvbkZuKGZpZWxkcykpO1xuICB9IGVsc2Uge1xuICAgIHF1ZXJ5LmFkZGVkKGRvYy5faWQsIHF1ZXJ5LnByb2plY3Rpb25GbihmaWVsZHMpKTtcbiAgICBxdWVyeS5yZXN1bHRzLnNldChkb2MuX2lkLCBkb2MpO1xuICB9XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX2luc2VydEluU29ydGVkTGlzdCA9IChjbXAsIGFycmF5LCB2YWx1ZSkgPT4ge1xuICBpZiAoYXJyYXkubGVuZ3RoID09PSAwKSB7XG4gICAgYXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgcmV0dXJuIDA7XG4gIH1cblxuICBjb25zdCBpID0gTG9jYWxDb2xsZWN0aW9uLl9iaW5hcnlTZWFyY2goY21wLCBhcnJheSwgdmFsdWUpO1xuXG4gIGFycmF5LnNwbGljZShpLCAwLCB2YWx1ZSk7XG5cbiAgcmV0dXJuIGk7XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX2lzTW9kaWZpY2F0aW9uTW9kID0gbW9kID0+IHtcbiAgbGV0IGlzTW9kaWZ5ID0gZmFsc2U7XG4gIGxldCBpc1JlcGxhY2UgPSBmYWxzZTtcblxuICBPYmplY3Qua2V5cyhtb2QpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAoa2V5LnN1YnN0cigwLCAxKSA9PT0gJyQnKSB7XG4gICAgICBpc01vZGlmeSA9IHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlzUmVwbGFjZSA9IHRydWU7XG4gICAgfVxuICB9KTtcblxuICBpZiAoaXNNb2RpZnkgJiYgaXNSZXBsYWNlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJ1VwZGF0ZSBwYXJhbWV0ZXIgY2Fubm90IGhhdmUgYm90aCBtb2RpZmllciBhbmQgbm9uLW1vZGlmaWVyIGZpZWxkcy4nXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBpc01vZGlmeTtcbn07XG5cbi8vIFhYWCBtYXliZSB0aGlzIHNob3VsZCBiZSBFSlNPTi5pc09iamVjdCwgdGhvdWdoIEVKU09OIGRvZXNuJ3Qga25vdyBhYm91dFxuLy8gUmVnRXhwXG4vLyBYWFggbm90ZSB0aGF0IF90eXBlKHVuZGVmaW5lZCkgPT09IDMhISEhXG5Mb2NhbENvbGxlY3Rpb24uX2lzUGxhaW5PYmplY3QgPSB4ID0+IHtcbiAgcmV0dXJuIHggJiYgTG9jYWxDb2xsZWN0aW9uLl9mLl90eXBlKHgpID09PSAzO1xufTtcblxuLy8gWFhYIG5lZWQgYSBzdHJhdGVneSBmb3IgcGFzc2luZyB0aGUgYmluZGluZyBvZiAkIGludG8gdGhpc1xuLy8gZnVuY3Rpb24sIGZyb20gdGhlIGNvbXBpbGVkIHNlbGVjdG9yXG4vL1xuLy8gbWF5YmUganVzdCB7a2V5LnVwLnRvLmp1c3QuYmVmb3JlLmRvbGxhcnNpZ246IGFycmF5X2luZGV4fVxuLy9cbi8vIFhYWCBhdG9taWNpdHk6IGlmIG9uZSBtb2RpZmljYXRpb24gZmFpbHMsIGRvIHdlIHJvbGwgYmFjayB0aGUgd2hvbGVcbi8vIGNoYW5nZT9cbi8vXG4vLyBvcHRpb25zOlxuLy8gICAtIGlzSW5zZXJ0IGlzIHNldCB3aGVuIF9tb2RpZnkgaXMgYmVpbmcgY2FsbGVkIHRvIGNvbXB1dGUgdGhlIGRvY3VtZW50IHRvXG4vLyAgICAgaW5zZXJ0IGFzIHBhcnQgb2YgYW4gdXBzZXJ0IG9wZXJhdGlvbi4gV2UgdXNlIHRoaXMgcHJpbWFyaWx5IHRvIGZpZ3VyZVxuLy8gICAgIG91dCB3aGVuIHRvIHNldCB0aGUgZmllbGRzIGluICRzZXRPbkluc2VydCwgaWYgcHJlc2VudC5cbkxvY2FsQ29sbGVjdGlvbi5fbW9kaWZ5ID0gKGRvYywgbW9kaWZpZXIsIG9wdGlvbnMgPSB7fSkgPT4ge1xuICBpZiAoIUxvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdChtb2RpZmllcikpIHtcbiAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignTW9kaWZpZXIgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgfVxuXG4gIC8vIE1ha2Ugc3VyZSB0aGUgY2FsbGVyIGNhbid0IG11dGF0ZSBvdXIgZGF0YSBzdHJ1Y3R1cmVzLlxuICBtb2RpZmllciA9IEVKU09OLmNsb25lKG1vZGlmaWVyKTtcblxuICBjb25zdCBpc01vZGlmaWVyID0gaXNPcGVyYXRvck9iamVjdChtb2RpZmllcik7XG4gIGNvbnN0IG5ld0RvYyA9IGlzTW9kaWZpZXIgPyBFSlNPTi5jbG9uZShkb2MpIDogbW9kaWZpZXI7XG5cbiAgaWYgKGlzTW9kaWZpZXIpIHtcbiAgICAvLyBhcHBseSBtb2RpZmllcnMgdG8gdGhlIGRvYy5cbiAgICBPYmplY3Qua2V5cyhtb2RpZmllcikuZm9yRWFjaChvcGVyYXRvciA9PiB7XG4gICAgICAvLyBUcmVhdCAkc2V0T25JbnNlcnQgYXMgJHNldCBpZiB0aGlzIGlzIGFuIGluc2VydC5cbiAgICAgIGNvbnN0IHNldE9uSW5zZXJ0ID0gb3B0aW9ucy5pc0luc2VydCAmJiBvcGVyYXRvciA9PT0gJyRzZXRPbkluc2VydCc7XG4gICAgICBjb25zdCBtb2RGdW5jID0gTU9ESUZJRVJTW3NldE9uSW5zZXJ0ID8gJyRzZXQnIDogb3BlcmF0b3JdO1xuICAgICAgY29uc3Qgb3BlcmFuZCA9IG1vZGlmaWVyW29wZXJhdG9yXTtcblxuICAgICAgaWYgKCFtb2RGdW5jKSB7XG4gICAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKGBJbnZhbGlkIG1vZGlmaWVyIHNwZWNpZmllZCAke29wZXJhdG9yfWApO1xuICAgICAgfVxuXG4gICAgICBPYmplY3Qua2V5cyhvcGVyYW5kKS5mb3JFYWNoKGtleXBhdGggPT4ge1xuICAgICAgICBjb25zdCBhcmcgPSBvcGVyYW5kW2tleXBhdGhdO1xuXG4gICAgICAgIGlmIChrZXlwYXRoID09PSAnJykge1xuICAgICAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdBbiBlbXB0eSB1cGRhdGUgcGF0aCBpcyBub3QgdmFsaWQuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlwYXJ0cyA9IGtleXBhdGguc3BsaXQoJy4nKTtcblxuICAgICAgICBpZiAoIWtleXBhcnRzLmV2ZXJ5KEJvb2xlYW4pKSB7XG4gICAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgICBgVGhlIHVwZGF0ZSBwYXRoICcke2tleXBhdGh9JyBjb250YWlucyBhbiBlbXB0eSBmaWVsZCBuYW1lLCBgICtcbiAgICAgICAgICAgICd3aGljaCBpcyBub3QgYWxsb3dlZC4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGZpbmRNb2RUYXJnZXQobmV3RG9jLCBrZXlwYXJ0cywge1xuICAgICAgICAgIGFycmF5SW5kaWNlczogb3B0aW9ucy5hcnJheUluZGljZXMsXG4gICAgICAgICAgZm9yYmlkQXJyYXk6IG9wZXJhdG9yID09PSAnJHJlbmFtZScsXG4gICAgICAgICAgbm9DcmVhdGU6IE5PX0NSRUFURV9NT0RJRklFUlNbb3BlcmF0b3JdXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG1vZEZ1bmModGFyZ2V0LCBrZXlwYXJ0cy5wb3AoKSwgYXJnLCBrZXlwYXRoLCBuZXdEb2MpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpZiAoZG9jLl9pZCAmJiAhRUpTT04uZXF1YWxzKGRvYy5faWQsIG5ld0RvYy5faWQpKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgYEFmdGVyIGFwcGx5aW5nIHRoZSB1cGRhdGUgdG8gdGhlIGRvY3VtZW50IHtfaWQ6IFwiJHtkb2MuX2lkfVwiLCAuLi59LGAgK1xuICAgICAgICAnIHRoZSAoaW1tdXRhYmxlKSBmaWVsZCBcXCdfaWRcXCcgd2FzIGZvdW5kIHRvIGhhdmUgYmVlbiBhbHRlcmVkIHRvICcgK1xuICAgICAgICBgX2lkOiBcIiR7bmV3RG9jLl9pZH1cImBcbiAgICAgICk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChkb2MuX2lkICYmIG1vZGlmaWVyLl9pZCAmJiAhRUpTT04uZXF1YWxzKGRvYy5faWQsIG1vZGlmaWVyLl9pZCkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICBgVGhlIF9pZCBmaWVsZCBjYW5ub3QgYmUgY2hhbmdlZCBmcm9tIHtfaWQ6IFwiJHtkb2MuX2lkfVwifSB0byBgICtcbiAgICAgICAgYHtfaWQ6IFwiJHttb2RpZmllci5faWR9XCJ9YFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyByZXBsYWNlIHRoZSB3aG9sZSBkb2N1bWVudFxuICAgIGFzc2VydEhhc1ZhbGlkRmllbGROYW1lcyhtb2RpZmllcik7XG4gIH1cblxuICAvLyBtb3ZlIG5ldyBkb2N1bWVudCBpbnRvIHBsYWNlLlxuICBPYmplY3Qua2V5cyhkb2MpLmZvckVhY2goa2V5ID0+IHtcbiAgICAvLyBOb3RlOiB0aGlzIHVzZWQgdG8gYmUgZm9yICh2YXIga2V5IGluIGRvYykgaG93ZXZlciwgdGhpcyBkb2VzIG5vdFxuICAgIC8vIHdvcmsgcmlnaHQgaW4gT3BlcmEuIERlbGV0aW5nIGZyb20gYSBkb2Mgd2hpbGUgaXRlcmF0aW5nIG92ZXIgaXRcbiAgICAvLyB3b3VsZCBzb21ldGltZXMgY2F1c2Ugb3BlcmEgdG8gc2tpcCBzb21lIGtleXMuXG4gICAgaWYgKGtleSAhPT0gJ19pZCcpIHtcbiAgICAgIGRlbGV0ZSBkb2Nba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIE9iamVjdC5rZXlzKG5ld0RvYykuZm9yRWFjaChrZXkgPT4ge1xuICAgIGRvY1trZXldID0gbmV3RG9jW2tleV07XG4gIH0pO1xufTtcblxuTG9jYWxDb2xsZWN0aW9uLl9vYnNlcnZlRnJvbU9ic2VydmVDaGFuZ2VzID0gKGN1cnNvciwgb2JzZXJ2ZUNhbGxiYWNrcykgPT4ge1xuICBjb25zdCB0cmFuc2Zvcm0gPSBjdXJzb3IuZ2V0VHJhbnNmb3JtKCkgfHwgKGRvYyA9PiBkb2MpO1xuICBsZXQgc3VwcHJlc3NlZCA9ICEhb2JzZXJ2ZUNhbGxiYWNrcy5fc3VwcHJlc3NfaW5pdGlhbDtcblxuICBsZXQgb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3M7XG4gIGlmIChMb2NhbENvbGxlY3Rpb24uX29ic2VydmVDYWxsYmFja3NBcmVPcmRlcmVkKG9ic2VydmVDYWxsYmFja3MpKSB7XG4gICAgLy8gVGhlIFwiX25vX2luZGljZXNcIiBvcHRpb24gc2V0cyBhbGwgaW5kZXggYXJndW1lbnRzIHRvIC0xIGFuZCBza2lwcyB0aGVcbiAgICAvLyBsaW5lYXIgc2NhbnMgcmVxdWlyZWQgdG8gZ2VuZXJhdGUgdGhlbS4gIFRoaXMgbGV0cyBvYnNlcnZlcnMgdGhhdCBkb24ndFxuICAgIC8vIG5lZWQgYWJzb2x1dGUgaW5kaWNlcyBiZW5lZml0IGZyb20gdGhlIG90aGVyIGZlYXR1cmVzIG9mIHRoaXMgQVBJIC0tXG4gICAgLy8gcmVsYXRpdmUgb3JkZXIsIHRyYW5zZm9ybXMsIGFuZCBhcHBseUNoYW5nZXMgLS0gd2l0aG91dCB0aGUgc3BlZWQgaGl0LlxuICAgIGNvbnN0IGluZGljZXMgPSAhb2JzZXJ2ZUNhbGxiYWNrcy5fbm9faW5kaWNlcztcblxuICAgIG9ic2VydmVDaGFuZ2VzQ2FsbGJhY2tzID0ge1xuICAgICAgYWRkZWRCZWZvcmUoaWQsIGZpZWxkcywgYmVmb3JlKSB7XG4gICAgICAgIGlmIChzdXBwcmVzc2VkIHx8ICEob2JzZXJ2ZUNhbGxiYWNrcy5hZGRlZEF0IHx8IG9ic2VydmVDYWxsYmFja3MuYWRkZWQpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZG9jID0gdHJhbnNmb3JtKE9iamVjdC5hc3NpZ24oZmllbGRzLCB7X2lkOiBpZH0pKTtcblxuICAgICAgICBpZiAob2JzZXJ2ZUNhbGxiYWNrcy5hZGRlZEF0KSB7XG4gICAgICAgICAgb2JzZXJ2ZUNhbGxiYWNrcy5hZGRlZEF0KFxuICAgICAgICAgICAgZG9jLFxuICAgICAgICAgICAgaW5kaWNlc1xuICAgICAgICAgICAgICA/IGJlZm9yZVxuICAgICAgICAgICAgICAgID8gdGhpcy5kb2NzLmluZGV4T2YoYmVmb3JlKVxuICAgICAgICAgICAgICAgIDogdGhpcy5kb2NzLnNpemUoKVxuICAgICAgICAgICAgICA6IC0xLFxuICAgICAgICAgICAgYmVmb3JlXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBvYnNlcnZlQ2FsbGJhY2tzLmFkZGVkKGRvYyk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBjaGFuZ2VkKGlkLCBmaWVsZHMpIHtcbiAgICAgICAgaWYgKCEob2JzZXJ2ZUNhbGxiYWNrcy5jaGFuZ2VkQXQgfHwgb2JzZXJ2ZUNhbGxiYWNrcy5jaGFuZ2VkKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBkb2MgPSBFSlNPTi5jbG9uZSh0aGlzLmRvY3MuZ2V0KGlkKSk7XG4gICAgICAgIGlmICghZG9jKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGlkIGZvciBjaGFuZ2VkOiAke2lkfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgb2xkRG9jID0gdHJhbnNmb3JtKEVKU09OLmNsb25lKGRvYykpO1xuXG4gICAgICAgIERpZmZTZXF1ZW5jZS5hcHBseUNoYW5nZXMoZG9jLCBmaWVsZHMpO1xuXG4gICAgICAgIGlmIChvYnNlcnZlQ2FsbGJhY2tzLmNoYW5nZWRBdCkge1xuICAgICAgICAgIG9ic2VydmVDYWxsYmFja3MuY2hhbmdlZEF0KFxuICAgICAgICAgICAgdHJhbnNmb3JtKGRvYyksXG4gICAgICAgICAgICBvbGREb2MsXG4gICAgICAgICAgICBpbmRpY2VzID8gdGhpcy5kb2NzLmluZGV4T2YoaWQpIDogLTFcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG9ic2VydmVDYWxsYmFja3MuY2hhbmdlZCh0cmFuc2Zvcm0oZG9jKSwgb2xkRG9jKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIG1vdmVkQmVmb3JlKGlkLCBiZWZvcmUpIHtcbiAgICAgICAgaWYgKCFvYnNlcnZlQ2FsbGJhY2tzLm1vdmVkVG8pIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBmcm9tID0gaW5kaWNlcyA/IHRoaXMuZG9jcy5pbmRleE9mKGlkKSA6IC0xO1xuICAgICAgICBsZXQgdG8gPSBpbmRpY2VzXG4gICAgICAgICAgPyBiZWZvcmVcbiAgICAgICAgICAgID8gdGhpcy5kb2NzLmluZGV4T2YoYmVmb3JlKVxuICAgICAgICAgICAgOiB0aGlzLmRvY3Muc2l6ZSgpXG4gICAgICAgICAgOiAtMTtcblxuICAgICAgICAvLyBXaGVuIG5vdCBtb3ZpbmcgYmFja3dhcmRzLCBhZGp1c3QgZm9yIHRoZSBmYWN0IHRoYXQgcmVtb3ZpbmcgdGhlXG4gICAgICAgIC8vIGRvY3VtZW50IHNsaWRlcyBldmVyeXRoaW5nIGJhY2sgb25lIHNsb3QuXG4gICAgICAgIGlmICh0byA+IGZyb20pIHtcbiAgICAgICAgICAtLXRvO1xuICAgICAgICB9XG5cbiAgICAgICAgb2JzZXJ2ZUNhbGxiYWNrcy5tb3ZlZFRvKFxuICAgICAgICAgIHRyYW5zZm9ybShFSlNPTi5jbG9uZSh0aGlzLmRvY3MuZ2V0KGlkKSkpLFxuICAgICAgICAgIGZyb20sXG4gICAgICAgICAgdG8sXG4gICAgICAgICAgYmVmb3JlIHx8IG51bGxcbiAgICAgICAgKTtcbiAgICAgIH0sXG4gICAgICByZW1vdmVkKGlkKSB7XG4gICAgICAgIGlmICghKG9ic2VydmVDYWxsYmFja3MucmVtb3ZlZEF0IHx8IG9ic2VydmVDYWxsYmFja3MucmVtb3ZlZCkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0ZWNobmljYWxseSBtYXliZSB0aGVyZSBzaG91bGQgYmUgYW4gRUpTT04uY2xvbmUgaGVyZSwgYnV0IGl0J3MgYWJvdXRcbiAgICAgICAgLy8gdG8gYmUgcmVtb3ZlZCBmcm9tIHRoaXMuZG9jcyFcbiAgICAgICAgY29uc3QgZG9jID0gdHJhbnNmb3JtKHRoaXMuZG9jcy5nZXQoaWQpKTtcblxuICAgICAgICBpZiAob2JzZXJ2ZUNhbGxiYWNrcy5yZW1vdmVkQXQpIHtcbiAgICAgICAgICBvYnNlcnZlQ2FsbGJhY2tzLnJlbW92ZWRBdChkb2MsIGluZGljZXMgPyB0aGlzLmRvY3MuaW5kZXhPZihpZCkgOiAtMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgb2JzZXJ2ZUNhbGxiYWNrcy5yZW1vdmVkKGRvYyk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICBvYnNlcnZlQ2hhbmdlc0NhbGxiYWNrcyA9IHtcbiAgICAgIGFkZGVkKGlkLCBmaWVsZHMpIHtcbiAgICAgICAgaWYgKCFzdXBwcmVzc2VkICYmIG9ic2VydmVDYWxsYmFja3MuYWRkZWQpIHtcbiAgICAgICAgICBvYnNlcnZlQ2FsbGJhY2tzLmFkZGVkKHRyYW5zZm9ybShPYmplY3QuYXNzaWduKGZpZWxkcywge19pZDogaWR9KSkpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgY2hhbmdlZChpZCwgZmllbGRzKSB7XG4gICAgICAgIGlmIChvYnNlcnZlQ2FsbGJhY2tzLmNoYW5nZWQpIHtcbiAgICAgICAgICBjb25zdCBvbGREb2MgPSB0aGlzLmRvY3MuZ2V0KGlkKTtcbiAgICAgICAgICBjb25zdCBkb2MgPSBFSlNPTi5jbG9uZShvbGREb2MpO1xuXG4gICAgICAgICAgRGlmZlNlcXVlbmNlLmFwcGx5Q2hhbmdlcyhkb2MsIGZpZWxkcyk7XG5cbiAgICAgICAgICBvYnNlcnZlQ2FsbGJhY2tzLmNoYW5nZWQoXG4gICAgICAgICAgICB0cmFuc2Zvcm0oZG9jKSxcbiAgICAgICAgICAgIHRyYW5zZm9ybShFSlNPTi5jbG9uZShvbGREb2MpKVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICByZW1vdmVkKGlkKSB7XG4gICAgICAgIGlmIChvYnNlcnZlQ2FsbGJhY2tzLnJlbW92ZWQpIHtcbiAgICAgICAgICBvYnNlcnZlQ2FsbGJhY2tzLnJlbW92ZWQodHJhbnNmb3JtKHRoaXMuZG9jcy5nZXQoaWQpKSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IGNoYW5nZU9ic2VydmVyID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fQ2FjaGluZ0NoYW5nZU9ic2VydmVyKHtcbiAgICBjYWxsYmFja3M6IG9ic2VydmVDaGFuZ2VzQ2FsbGJhY2tzXG4gIH0pO1xuXG4gIC8vIENhY2hpbmdDaGFuZ2VPYnNlcnZlciBjbG9uZXMgYWxsIHJlY2VpdmVkIGlucHV0IG9uIGl0cyBjYWxsYmFja3NcbiAgLy8gU28gd2UgY2FuIG1hcmsgaXQgYXMgc2FmZSB0byByZWR1Y2UgdGhlIGVqc29uIGNsb25lcy5cbiAgLy8gVGhpcyBpcyB0ZXN0ZWQgYnkgdGhlIGBtb25nby1saXZlZGF0YSAtIChleHRlbmRlZCkgc2NyaWJibGluZ2AgdGVzdHNcbiAgY2hhbmdlT2JzZXJ2ZXIuYXBwbHlDaGFuZ2UuX2Zyb21PYnNlcnZlID0gdHJ1ZTtcbiAgY29uc3QgaGFuZGxlID0gY3Vyc29yLm9ic2VydmVDaGFuZ2VzKGNoYW5nZU9ic2VydmVyLmFwcGx5Q2hhbmdlLFxuICAgIHsgbm9uTXV0YXRpbmdDYWxsYmFja3M6IHRydWUgfSk7XG5cbiAgc3VwcHJlc3NlZCA9IGZhbHNlO1xuXG4gIHJldHVybiBoYW5kbGU7XG59O1xuXG5Mb2NhbENvbGxlY3Rpb24uX29ic2VydmVDYWxsYmFja3NBcmVPcmRlcmVkID0gY2FsbGJhY2tzID0+IHtcbiAgaWYgKGNhbGxiYWNrcy5hZGRlZCAmJiBjYWxsYmFja3MuYWRkZWRBdCkge1xuICAgIHRocm93IG5ldyBFcnJvcignUGxlYXNlIHNwZWNpZnkgb25seSBvbmUgb2YgYWRkZWQoKSBhbmQgYWRkZWRBdCgpJyk7XG4gIH1cblxuICBpZiAoY2FsbGJhY2tzLmNoYW5nZWQgJiYgY2FsbGJhY2tzLmNoYW5nZWRBdCkge1xuICAgIHRocm93IG5ldyBFcnJvcignUGxlYXNlIHNwZWNpZnkgb25seSBvbmUgb2YgY2hhbmdlZCgpIGFuZCBjaGFuZ2VkQXQoKScpO1xuICB9XG5cbiAgaWYgKGNhbGxiYWNrcy5yZW1vdmVkICYmIGNhbGxiYWNrcy5yZW1vdmVkQXQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1BsZWFzZSBzcGVjaWZ5IG9ubHkgb25lIG9mIHJlbW92ZWQoKSBhbmQgcmVtb3ZlZEF0KCknKTtcbiAgfVxuXG4gIHJldHVybiAhIShcbiAgICBjYWxsYmFja3MuYWRkZWRBdCB8fFxuICAgIGNhbGxiYWNrcy5jaGFuZ2VkQXQgfHxcbiAgICBjYWxsYmFja3MubW92ZWRUbyB8fFxuICAgIGNhbGxiYWNrcy5yZW1vdmVkQXRcbiAgKTtcbn07XG5cbkxvY2FsQ29sbGVjdGlvbi5fb2JzZXJ2ZUNoYW5nZXNDYWxsYmFja3NBcmVPcmRlcmVkID0gY2FsbGJhY2tzID0+IHtcbiAgaWYgKGNhbGxiYWNrcy5hZGRlZCAmJiBjYWxsYmFja3MuYWRkZWRCZWZvcmUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1BsZWFzZSBzcGVjaWZ5IG9ubHkgb25lIG9mIGFkZGVkKCkgYW5kIGFkZGVkQmVmb3JlKCknKTtcbiAgfVxuXG4gIHJldHVybiAhIShjYWxsYmFja3MuYWRkZWRCZWZvcmUgfHwgY2FsbGJhY2tzLm1vdmVkQmVmb3JlKTtcbn07XG5cbkxvY2FsQ29sbGVjdGlvbi5fcmVtb3ZlRnJvbVJlc3VsdHMgPSAocXVlcnksIGRvYykgPT4ge1xuICBpZiAocXVlcnkub3JkZXJlZCkge1xuICAgIGNvbnN0IGkgPSBMb2NhbENvbGxlY3Rpb24uX2ZpbmRJbk9yZGVyZWRSZXN1bHRzKHF1ZXJ5LCBkb2MpO1xuXG4gICAgcXVlcnkucmVtb3ZlZChkb2MuX2lkKTtcbiAgICBxdWVyeS5yZXN1bHRzLnNwbGljZShpLCAxKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBpZCA9IGRvYy5faWQ7ICAvLyBpbiBjYXNlIGNhbGxiYWNrIG11dGF0ZXMgZG9jXG5cbiAgICBxdWVyeS5yZW1vdmVkKGRvYy5faWQpO1xuICAgIHF1ZXJ5LnJlc3VsdHMucmVtb3ZlKGlkKTtcbiAgfVxufTtcblxuLy8gSXMgdGhpcyBzZWxlY3RvciBqdXN0IHNob3J0aGFuZCBmb3IgbG9va3VwIGJ5IF9pZD9cbkxvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkID0gc2VsZWN0b3IgPT5cbiAgdHlwZW9mIHNlbGVjdG9yID09PSAnbnVtYmVyJyB8fFxuICB0eXBlb2Ygc2VsZWN0b3IgPT09ICdzdHJpbmcnIHx8XG4gIHNlbGVjdG9yIGluc3RhbmNlb2YgTW9uZ29JRC5PYmplY3RJRFxuO1xuXG4vLyBJcyB0aGUgc2VsZWN0b3IganVzdCBsb29rdXAgYnkgX2lkIChzaG9ydGhhbmQgb3Igbm90KT9cbkxvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkUGVyaGFwc0FzT2JqZWN0ID0gc2VsZWN0b3IgPT5cbiAgTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWQoc2VsZWN0b3IpIHx8XG4gIExvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkKHNlbGVjdG9yICYmIHNlbGVjdG9yLl9pZCkgJiZcbiAgT2JqZWN0LmtleXMoc2VsZWN0b3IpLmxlbmd0aCA9PT0gMVxuO1xuXG5Mb2NhbENvbGxlY3Rpb24uX3VwZGF0ZUluUmVzdWx0cyA9IChxdWVyeSwgZG9jLCBvbGRfZG9jKSA9PiB7XG4gIGlmICghRUpTT04uZXF1YWxzKGRvYy5faWQsIG9sZF9kb2MuX2lkKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignQ2FuXFwndCBjaGFuZ2UgYSBkb2NcXCdzIF9pZCB3aGlsZSB1cGRhdGluZycpO1xuICB9XG5cbiAgY29uc3QgcHJvamVjdGlvbkZuID0gcXVlcnkucHJvamVjdGlvbkZuO1xuICBjb25zdCBjaGFuZ2VkRmllbGRzID0gRGlmZlNlcXVlbmNlLm1ha2VDaGFuZ2VkRmllbGRzKFxuICAgIHByb2plY3Rpb25Gbihkb2MpLFxuICAgIHByb2plY3Rpb25GbihvbGRfZG9jKVxuICApO1xuXG4gIGlmICghcXVlcnkub3JkZXJlZCkge1xuICAgIGlmIChPYmplY3Qua2V5cyhjaGFuZ2VkRmllbGRzKS5sZW5ndGgpIHtcbiAgICAgIHF1ZXJ5LmNoYW5nZWQoZG9jLl9pZCwgY2hhbmdlZEZpZWxkcyk7XG4gICAgICBxdWVyeS5yZXN1bHRzLnNldChkb2MuX2lkLCBkb2MpO1xuICAgIH1cblxuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IG9sZF9pZHggPSBMb2NhbENvbGxlY3Rpb24uX2ZpbmRJbk9yZGVyZWRSZXN1bHRzKHF1ZXJ5LCBkb2MpO1xuXG4gIGlmIChPYmplY3Qua2V5cyhjaGFuZ2VkRmllbGRzKS5sZW5ndGgpIHtcbiAgICBxdWVyeS5jaGFuZ2VkKGRvYy5faWQsIGNoYW5nZWRGaWVsZHMpO1xuICB9XG5cbiAgaWYgKCFxdWVyeS5zb3J0ZXIpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBqdXN0IHRha2UgaXQgb3V0IGFuZCBwdXQgaXQgYmFjayBpbiBhZ2FpbiwgYW5kIHNlZSBpZiB0aGUgaW5kZXggY2hhbmdlc1xuICBxdWVyeS5yZXN1bHRzLnNwbGljZShvbGRfaWR4LCAxKTtcblxuICBjb25zdCBuZXdfaWR4ID0gTG9jYWxDb2xsZWN0aW9uLl9pbnNlcnRJblNvcnRlZExpc3QoXG4gICAgcXVlcnkuc29ydGVyLmdldENvbXBhcmF0b3Ioe2Rpc3RhbmNlczogcXVlcnkuZGlzdGFuY2VzfSksXG4gICAgcXVlcnkucmVzdWx0cyxcbiAgICBkb2NcbiAgKTtcblxuICBpZiAob2xkX2lkeCAhPT0gbmV3X2lkeCkge1xuICAgIGxldCBuZXh0ID0gcXVlcnkucmVzdWx0c1tuZXdfaWR4ICsgMV07XG4gICAgaWYgKG5leHQpIHtcbiAgICAgIG5leHQgPSBuZXh0Ll9pZDtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCA9IG51bGw7XG4gICAgfVxuXG4gICAgcXVlcnkubW92ZWRCZWZvcmUgJiYgcXVlcnkubW92ZWRCZWZvcmUoZG9jLl9pZCwgbmV4dCk7XG4gIH1cbn07XG5cbmNvbnN0IE1PRElGSUVSUyA9IHtcbiAgJGN1cnJlbnREYXRlKHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIGlmICh0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBoYXNPd24uY2FsbChhcmcsICckdHlwZScpKSB7XG4gICAgICBpZiAoYXJnLiR0eXBlICE9PSAnZGF0ZScpIHtcbiAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgJ01pbmltb25nbyBkb2VzIGN1cnJlbnRseSBvbmx5IHN1cHBvcnQgdGhlIGRhdGUgdHlwZSBpbiAnICtcbiAgICAgICAgICAnJGN1cnJlbnREYXRlIG1vZGlmaWVycycsXG4gICAgICAgICAge2ZpZWxkfVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoYXJnICE9PSB0cnVlKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignSW52YWxpZCAkY3VycmVudERhdGUgbW9kaWZpZXInLCB7ZmllbGR9KTtcbiAgICB9XG5cbiAgICB0YXJnZXRbZmllbGRdID0gbmV3IERhdGUoKTtcbiAgfSxcbiAgJGluYyh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICBpZiAodHlwZW9mIGFyZyAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdNb2RpZmllciAkaW5jIGFsbG93ZWQgZm9yIG51bWJlcnMgb25seScsIHtmaWVsZH0pO1xuICAgIH1cblxuICAgIGlmIChmaWVsZCBpbiB0YXJnZXQpIHtcbiAgICAgIGlmICh0eXBlb2YgdGFyZ2V0W2ZpZWxkXSAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgJ0Nhbm5vdCBhcHBseSAkaW5jIG1vZGlmaWVyIHRvIG5vbi1udW1iZXInLFxuICAgICAgICAgIHtmaWVsZH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgdGFyZ2V0W2ZpZWxkXSArPSBhcmc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRhcmdldFtmaWVsZF0gPSBhcmc7XG4gICAgfVxuICB9LFxuICAkbWluKHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIGlmICh0eXBlb2YgYXJnICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJ01vZGlmaWVyICRtaW4gYWxsb3dlZCBmb3IgbnVtYmVycyBvbmx5Jywge2ZpZWxkfSk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkIGluIHRhcmdldCkge1xuICAgICAgaWYgKHR5cGVvZiB0YXJnZXRbZmllbGRdICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgICAnQ2Fubm90IGFwcGx5ICRtaW4gbW9kaWZpZXIgdG8gbm9uLW51bWJlcicsXG4gICAgICAgICAge2ZpZWxkfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAodGFyZ2V0W2ZpZWxkXSA+IGFyZykge1xuICAgICAgICB0YXJnZXRbZmllbGRdID0gYXJnO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0YXJnZXRbZmllbGRdID0gYXJnO1xuICAgIH1cbiAgfSxcbiAgJG1heCh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICBpZiAodHlwZW9mIGFyZyAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdNb2RpZmllciAkbWF4IGFsbG93ZWQgZm9yIG51bWJlcnMgb25seScsIHtmaWVsZH0pO1xuICAgIH1cblxuICAgIGlmIChmaWVsZCBpbiB0YXJnZXQpIHtcbiAgICAgIGlmICh0eXBlb2YgdGFyZ2V0W2ZpZWxkXSAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgJ0Nhbm5vdCBhcHBseSAkbWF4IG1vZGlmaWVyIHRvIG5vbi1udW1iZXInLFxuICAgICAgICAgIHtmaWVsZH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRhcmdldFtmaWVsZF0gPCBhcmcpIHtcbiAgICAgICAgdGFyZ2V0W2ZpZWxkXSA9IGFyZztcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGFyZ2V0W2ZpZWxkXSA9IGFyZztcbiAgICB9XG4gIH0sXG4gICRtdWwodGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgaWYgKHR5cGVvZiBhcmcgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignTW9kaWZpZXIgJG11bCBhbGxvd2VkIGZvciBudW1iZXJzIG9ubHknLCB7ZmllbGR9KTtcbiAgICB9XG5cbiAgICBpZiAoZmllbGQgaW4gdGFyZ2V0KSB7XG4gICAgICBpZiAodHlwZW9mIHRhcmdldFtmaWVsZF0gIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAgICdDYW5ub3QgYXBwbHkgJG11bCBtb2RpZmllciB0byBub24tbnVtYmVyJyxcbiAgICAgICAgICB7ZmllbGR9XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHRhcmdldFtmaWVsZF0gKj0gYXJnO1xuICAgIH0gZWxzZSB7XG4gICAgICB0YXJnZXRbZmllbGRdID0gMDtcbiAgICB9XG4gIH0sXG4gICRyZW5hbWUodGFyZ2V0LCBmaWVsZCwgYXJnLCBrZXlwYXRoLCBkb2MpIHtcbiAgICAvLyBubyBpZGVhIHdoeSBtb25nbyBoYXMgdGhpcyByZXN0cmljdGlvbi4uXG4gICAgaWYgKGtleXBhdGggPT09IGFyZykge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJyRyZW5hbWUgc291cmNlIG11c3QgZGlmZmVyIGZyb20gdGFyZ2V0Jywge2ZpZWxkfSk7XG4gICAgfVxuXG4gICAgaWYgKHRhcmdldCA9PT0gbnVsbCkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJyRyZW5hbWUgc291cmNlIGZpZWxkIGludmFsaWQnLCB7ZmllbGR9KTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGFyZyAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCckcmVuYW1lIHRhcmdldCBtdXN0IGJlIGEgc3RyaW5nJywge2ZpZWxkfSk7XG4gICAgfVxuXG4gICAgaWYgKGFyZy5pbmNsdWRlcygnXFwwJykpIHtcbiAgICAgIC8vIE51bGwgYnl0ZXMgYXJlIG5vdCBhbGxvd2VkIGluIE1vbmdvIGZpZWxkIG5hbWVzXG4gICAgICAvLyBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9saW1pdHMvI1Jlc3RyaWN0aW9ucy1vbi1GaWVsZC1OYW1lc1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICdUaGUgXFwndG9cXCcgZmllbGQgZm9yICRyZW5hbWUgY2Fubm90IGNvbnRhaW4gYW4gZW1iZWRkZWQgbnVsbCBieXRlJyxcbiAgICAgICAge2ZpZWxkfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBvYmplY3QgPSB0YXJnZXRbZmllbGRdO1xuXG4gICAgZGVsZXRlIHRhcmdldFtmaWVsZF07XG5cbiAgICBjb25zdCBrZXlwYXJ0cyA9IGFyZy5zcGxpdCgnLicpO1xuICAgIGNvbnN0IHRhcmdldDIgPSBmaW5kTW9kVGFyZ2V0KGRvYywga2V5cGFydHMsIHtmb3JiaWRBcnJheTogdHJ1ZX0pO1xuXG4gICAgaWYgKHRhcmdldDIgPT09IG51bGwpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCckcmVuYW1lIHRhcmdldCBmaWVsZCBpbnZhbGlkJywge2ZpZWxkfSk7XG4gICAgfVxuXG4gICAgdGFyZ2V0MltrZXlwYXJ0cy5wb3AoKV0gPSBvYmplY3Q7XG4gIH0sXG4gICRzZXQodGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgaWYgKHRhcmdldCAhPT0gT2JqZWN0KHRhcmdldCkpIHsgLy8gbm90IGFuIGFycmF5IG9yIGFuIG9iamVjdFxuICAgICAgY29uc3QgZXJyb3IgPSBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgJ0Nhbm5vdCBzZXQgcHJvcGVydHkgb24gbm9uLW9iamVjdCBmaWVsZCcsXG4gICAgICAgIHtmaWVsZH1cbiAgICAgICk7XG4gICAgICBlcnJvci5zZXRQcm9wZXJ0eUVycm9yID0gdHJ1ZTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cblxuICAgIGlmICh0YXJnZXQgPT09IG51bGwpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gTWluaW1vbmdvRXJyb3IoJ0Nhbm5vdCBzZXQgcHJvcGVydHkgb24gbnVsbCcsIHtmaWVsZH0pO1xuICAgICAgZXJyb3Iuc2V0UHJvcGVydHlFcnJvciA9IHRydWU7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG5cbiAgICBhc3NlcnRIYXNWYWxpZEZpZWxkTmFtZXMoYXJnKTtcblxuICAgIHRhcmdldFtmaWVsZF0gPSBhcmc7XG4gIH0sXG4gICRzZXRPbkluc2VydCh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICAvLyBjb252ZXJ0ZWQgdG8gYCRzZXRgIGluIGBfbW9kaWZ5YFxuICB9LFxuICAkdW5zZXQodGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgaWYgKHRhcmdldCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAodGFyZ2V0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgaWYgKGZpZWxkIGluIHRhcmdldCkge1xuICAgICAgICAgIHRhcmdldFtmaWVsZF0gPSBudWxsO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWxldGUgdGFyZ2V0W2ZpZWxkXTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gICRwdXNoKHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIGlmICh0YXJnZXRbZmllbGRdID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRhcmdldFtmaWVsZF0gPSBbXTtcbiAgICB9XG5cbiAgICBpZiAoISh0YXJnZXRbZmllbGRdIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignQ2Fubm90IGFwcGx5ICRwdXNoIG1vZGlmaWVyIHRvIG5vbi1hcnJheScsIHtmaWVsZH0pO1xuICAgIH1cblxuICAgIGlmICghKGFyZyAmJiBhcmcuJGVhY2gpKSB7XG4gICAgICAvLyBTaW1wbGUgbW9kZTogbm90ICRlYWNoXG4gICAgICBhc3NlcnRIYXNWYWxpZEZpZWxkTmFtZXMoYXJnKTtcblxuICAgICAgdGFyZ2V0W2ZpZWxkXS5wdXNoKGFyZyk7XG5cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBGYW5jeSBtb2RlOiAkZWFjaCAoYW5kIG1heWJlICRzbGljZSBhbmQgJHNvcnQgYW5kICRwb3NpdGlvbilcbiAgICBjb25zdCB0b1B1c2ggPSBhcmcuJGVhY2g7XG4gICAgaWYgKCEodG9QdXNoIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignJGVhY2ggbXVzdCBiZSBhbiBhcnJheScsIHtmaWVsZH0pO1xuICAgIH1cblxuICAgIGFzc2VydEhhc1ZhbGlkRmllbGROYW1lcyh0b1B1c2gpO1xuXG4gICAgLy8gUGFyc2UgJHBvc2l0aW9uXG4gICAgbGV0IHBvc2l0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmICgnJHBvc2l0aW9uJyBpbiBhcmcpIHtcbiAgICAgIGlmICh0eXBlb2YgYXJnLiRwb3NpdGlvbiAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJyRwb3NpdGlvbiBtdXN0IGJlIGEgbnVtZXJpYyB2YWx1ZScsIHtmaWVsZH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBYWFggc2hvdWxkIGNoZWNrIHRvIG1ha2Ugc3VyZSBpbnRlZ2VyXG4gICAgICBpZiAoYXJnLiRwb3NpdGlvbiA8IDApIHtcbiAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgJyRwb3NpdGlvbiBpbiAkcHVzaCBtdXN0IGJlIHplcm8gb3IgcG9zaXRpdmUnLFxuICAgICAgICAgIHtmaWVsZH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcG9zaXRpb24gPSBhcmcuJHBvc2l0aW9uO1xuICAgIH1cblxuICAgIC8vIFBhcnNlICRzbGljZS5cbiAgICBsZXQgc2xpY2UgPSB1bmRlZmluZWQ7XG4gICAgaWYgKCckc2xpY2UnIGluIGFyZykge1xuICAgICAgaWYgKHR5cGVvZiBhcmcuJHNsaWNlICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcignJHNsaWNlIG11c3QgYmUgYSBudW1lcmljIHZhbHVlJywge2ZpZWxkfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFhYWCBzaG91bGQgY2hlY2sgdG8gbWFrZSBzdXJlIGludGVnZXJcbiAgICAgIHNsaWNlID0gYXJnLiRzbGljZTtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSAkc29ydC5cbiAgICBsZXQgc29ydEZ1bmN0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChhcmcuJHNvcnQpIHtcbiAgICAgIGlmIChzbGljZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCckc29ydCByZXF1aXJlcyAkc2xpY2UgdG8gYmUgcHJlc2VudCcsIHtmaWVsZH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBYWFggdGhpcyBhbGxvd3MgdXMgdG8gdXNlIGEgJHNvcnQgd2hvc2UgdmFsdWUgaXMgYW4gYXJyYXksIGJ1dCB0aGF0J3NcbiAgICAgIC8vIGFjdHVhbGx5IGFuIGV4dGVuc2lvbiBvZiB0aGUgTm9kZSBkcml2ZXIsIHNvIGl0IHdvbid0IHdvcmtcbiAgICAgIC8vIHNlcnZlci1zaWRlLiBDb3VsZCBiZSBjb25mdXNpbmchXG4gICAgICAvLyBYWFggaXMgaXQgY29ycmVjdCB0aGF0IHdlIGRvbid0IGRvIGdlby1zdHVmZiBoZXJlP1xuICAgICAgc29ydEZ1bmN0aW9uID0gbmV3IE1pbmltb25nby5Tb3J0ZXIoYXJnLiRzb3J0KS5nZXRDb21wYXJhdG9yKCk7XG5cbiAgICAgIHRvUHVzaC5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuICAgICAgICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9mLl90eXBlKGVsZW1lbnQpICE9PSAzKSB7XG4gICAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgICAnJHB1c2ggbGlrZSBtb2RpZmllcnMgdXNpbmcgJHNvcnQgcmVxdWlyZSBhbGwgZWxlbWVudHMgdG8gYmUgJyArXG4gICAgICAgICAgICAnb2JqZWN0cycsXG4gICAgICAgICAgICB7ZmllbGR9XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQWN0dWFsbHkgcHVzaC5cbiAgICBpZiAocG9zaXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgdG9QdXNoLmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICAgIHRhcmdldFtmaWVsZF0ucHVzaChlbGVtZW50KTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBzcGxpY2VBcmd1bWVudHMgPSBbcG9zaXRpb24sIDBdO1xuXG4gICAgICB0b1B1c2guZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgc3BsaWNlQXJndW1lbnRzLnB1c2goZWxlbWVudCk7XG4gICAgICB9KTtcblxuICAgICAgdGFyZ2V0W2ZpZWxkXS5zcGxpY2UoLi4uc3BsaWNlQXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICAvLyBBY3R1YWxseSBzb3J0LlxuICAgIGlmIChzb3J0RnVuY3Rpb24pIHtcbiAgICAgIHRhcmdldFtmaWVsZF0uc29ydChzb3J0RnVuY3Rpb24pO1xuICAgIH1cblxuICAgIC8vIEFjdHVhbGx5IHNsaWNlLlxuICAgIGlmIChzbGljZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoc2xpY2UgPT09IDApIHtcbiAgICAgICAgdGFyZ2V0W2ZpZWxkXSA9IFtdOyAvLyBkaWZmZXJzIGZyb20gQXJyYXkuc2xpY2UhXG4gICAgICB9IGVsc2UgaWYgKHNsaWNlIDwgMCkge1xuICAgICAgICB0YXJnZXRbZmllbGRdID0gdGFyZ2V0W2ZpZWxkXS5zbGljZShzbGljZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0YXJnZXRbZmllbGRdID0gdGFyZ2V0W2ZpZWxkXS5zbGljZSgwLCBzbGljZSk7XG4gICAgICB9XG4gICAgfVxuICB9LFxuICAkcHVzaEFsbCh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICBpZiAoISh0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdNb2RpZmllciAkcHVzaEFsbC9wdWxsQWxsIGFsbG93ZWQgZm9yIGFycmF5cyBvbmx5Jyk7XG4gICAgfVxuXG4gICAgYXNzZXJ0SGFzVmFsaWRGaWVsZE5hbWVzKGFyZyk7XG5cbiAgICBjb25zdCB0b1B1c2ggPSB0YXJnZXRbZmllbGRdO1xuXG4gICAgaWYgKHRvUHVzaCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0YXJnZXRbZmllbGRdID0gYXJnO1xuICAgIH0gZWxzZSBpZiAoISh0b1B1c2ggaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAnQ2Fubm90IGFwcGx5ICRwdXNoQWxsIG1vZGlmaWVyIHRvIG5vbi1hcnJheScsXG4gICAgICAgIHtmaWVsZH1cbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRvUHVzaC5wdXNoKC4uLmFyZyk7XG4gICAgfVxuICB9LFxuICAkYWRkVG9TZXQodGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgbGV0IGlzRWFjaCA9IGZhbHNlO1xuXG4gICAgaWYgKHR5cGVvZiBhcmcgPT09ICdvYmplY3QnKSB7XG4gICAgICAvLyBjaGVjayBpZiBmaXJzdCBrZXkgaXMgJyRlYWNoJ1xuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKGFyZyk7XG4gICAgICBpZiAoa2V5c1swXSA9PT0gJyRlYWNoJykge1xuICAgICAgICBpc0VhY2ggPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHZhbHVlcyA9IGlzRWFjaCA/IGFyZy4kZWFjaCA6IFthcmddO1xuXG4gICAgYXNzZXJ0SGFzVmFsaWRGaWVsZE5hbWVzKHZhbHVlcyk7XG5cbiAgICBjb25zdCB0b0FkZCA9IHRhcmdldFtmaWVsZF07XG4gICAgaWYgKHRvQWRkID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRhcmdldFtmaWVsZF0gPSB2YWx1ZXM7XG4gICAgfSBlbHNlIGlmICghKHRvQWRkIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgJ0Nhbm5vdCBhcHBseSAkYWRkVG9TZXQgbW9kaWZpZXIgdG8gbm9uLWFycmF5JyxcbiAgICAgICAge2ZpZWxkfVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWVzLmZvckVhY2godmFsdWUgPT4ge1xuICAgICAgICBpZiAodG9BZGQuc29tZShlbGVtZW50ID0+IExvY2FsQ29sbGVjdGlvbi5fZi5fZXF1YWwodmFsdWUsIGVsZW1lbnQpKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRvQWRkLnB1c2godmFsdWUpO1xuICAgICAgfSk7XG4gICAgfVxuICB9LFxuICAkcG9wKHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRvUG9wID0gdGFyZ2V0W2ZpZWxkXTtcblxuICAgIGlmICh0b1BvcCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCEodG9Qb3AgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKCdDYW5ub3QgYXBwbHkgJHBvcCBtb2RpZmllciB0byBub24tYXJyYXknLCB7ZmllbGR9KTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGFyZyA9PT0gJ251bWJlcicgJiYgYXJnIDwgMCkge1xuICAgICAgdG9Qb3Auc3BsaWNlKDAsIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0b1BvcC5wb3AoKTtcbiAgICB9XG4gIH0sXG4gICRwdWxsKHRhcmdldCwgZmllbGQsIGFyZykge1xuICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRvUHVsbCA9IHRhcmdldFtmaWVsZF07XG4gICAgaWYgKHRvUHVsbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCEodG9QdWxsIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgJ0Nhbm5vdCBhcHBseSAkcHVsbC9wdWxsQWxsIG1vZGlmaWVyIHRvIG5vbi1hcnJheScsXG4gICAgICAgIHtmaWVsZH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgbGV0IG91dDtcbiAgICBpZiAoYXJnICE9IG51bGwgJiYgdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgIShhcmcgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIC8vIFhYWCB3b3VsZCBiZSBtdWNoIG5pY2VyIHRvIGNvbXBpbGUgdGhpcyBvbmNlLCByYXRoZXIgdGhhblxuICAgICAgLy8gZm9yIGVhY2ggZG9jdW1lbnQgd2UgbW9kaWZ5Li4gYnV0IHVzdWFsbHkgd2UncmUgbm90XG4gICAgICAvLyBtb2RpZnlpbmcgdGhhdCBtYW55IGRvY3VtZW50cywgc28gd2UnbGwgbGV0IGl0IHNsaWRlIGZvclxuICAgICAgLy8gbm93XG5cbiAgICAgIC8vIFhYWCBNaW5pbW9uZ28uTWF0Y2hlciBpc24ndCB1cCBmb3IgdGhlIGpvYiwgYmVjYXVzZSB3ZSBuZWVkXG4gICAgICAvLyB0byBwZXJtaXQgc3R1ZmYgbGlrZSB7JHB1bGw6IHthOiB7JGd0OiA0fX19Li4gc29tZXRoaW5nXG4gICAgICAvLyBsaWtlIHskZ3Q6IDR9IGlzIG5vdCBub3JtYWxseSBhIGNvbXBsZXRlIHNlbGVjdG9yLlxuICAgICAgLy8gc2FtZSBpc3N1ZSBhcyAkZWxlbU1hdGNoIHBvc3NpYmx5P1xuICAgICAgY29uc3QgbWF0Y2hlciA9IG5ldyBNaW5pbW9uZ28uTWF0Y2hlcihhcmcpO1xuXG4gICAgICBvdXQgPSB0b1B1bGwuZmlsdGVyKGVsZW1lbnQgPT4gIW1hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKGVsZW1lbnQpLnJlc3VsdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dCA9IHRvUHVsbC5maWx0ZXIoZWxlbWVudCA9PiAhTG9jYWxDb2xsZWN0aW9uLl9mLl9lcXVhbChlbGVtZW50LCBhcmcpKTtcbiAgICB9XG5cbiAgICB0YXJnZXRbZmllbGRdID0gb3V0O1xuICB9LFxuICAkcHVsbEFsbCh0YXJnZXQsIGZpZWxkLCBhcmcpIHtcbiAgICBpZiAoISh0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAnTW9kaWZpZXIgJHB1c2hBbGwvcHVsbEFsbCBhbGxvd2VkIGZvciBhcnJheXMgb25seScsXG4gICAgICAgIHtmaWVsZH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdG9QdWxsID0gdGFyZ2V0W2ZpZWxkXTtcblxuICAgIGlmICh0b1B1bGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghKHRvUHVsbCBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICdDYW5ub3QgYXBwbHkgJHB1bGwvcHVsbEFsbCBtb2RpZmllciB0byBub24tYXJyYXknLFxuICAgICAgICB7ZmllbGR9XG4gICAgICApO1xuICAgIH1cblxuICAgIHRhcmdldFtmaWVsZF0gPSB0b1B1bGwuZmlsdGVyKG9iamVjdCA9PlxuICAgICAgIWFyZy5zb21lKGVsZW1lbnQgPT4gTG9jYWxDb2xsZWN0aW9uLl9mLl9lcXVhbChvYmplY3QsIGVsZW1lbnQpKVxuICAgICk7XG4gIH0sXG4gICRiaXQodGFyZ2V0LCBmaWVsZCwgYXJnKSB7XG4gICAgLy8gWFhYIG1vbmdvIG9ubHkgc3VwcG9ydHMgJGJpdCBvbiBpbnRlZ2VycywgYW5kIHdlIG9ubHkgc3VwcG9ydFxuICAgIC8vIG5hdGl2ZSBqYXZhc2NyaXB0IG51bWJlcnMgKGRvdWJsZXMpIHNvIGZhciwgc28gd2UgY2FuJ3Qgc3VwcG9ydCAkYml0XG4gICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJyRiaXQgaXMgbm90IHN1cHBvcnRlZCcsIHtmaWVsZH0pO1xuICB9LFxuICAkdigpIHtcbiAgICAvLyBBcyBkaXNjdXNzZWQgaW4gaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvaXNzdWVzLzk2MjMsXG4gICAgLy8gdGhlIGAkdmAgb3BlcmF0b3IgaXMgbm90IG5lZWRlZCBieSBNZXRlb3IsIGJ1dCBwcm9ibGVtcyBjYW4gb2NjdXIgaWZcbiAgICAvLyBpdCdzIG5vdCBhdCBsZWFzdCBjYWxsYWJsZSAoYXMgb2YgTW9uZ28gPj0gMy42KS4gSXQncyBkZWZpbmVkIGhlcmUgYXNcbiAgICAvLyBhIG5vLW9wIHRvIHdvcmsgYXJvdW5kIHRoZXNlIHByb2JsZW1zLlxuICB9XG59O1xuXG5jb25zdCBOT19DUkVBVEVfTU9ESUZJRVJTID0ge1xuICAkcG9wOiB0cnVlLFxuICAkcHVsbDogdHJ1ZSxcbiAgJHB1bGxBbGw6IHRydWUsXG4gICRyZW5hbWU6IHRydWUsXG4gICR1bnNldDogdHJ1ZVxufTtcblxuLy8gTWFrZSBzdXJlIGZpZWxkIG5hbWVzIGRvIG5vdCBjb250YWluIE1vbmdvIHJlc3RyaWN0ZWRcbi8vIGNoYXJhY3RlcnMgKCcuJywgJyQnLCAnXFwwJykuXG4vLyBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9saW1pdHMvI1Jlc3RyaWN0aW9ucy1vbi1GaWVsZC1OYW1lc1xuY29uc3QgaW52YWxpZENoYXJNc2cgPSB7XG4gICQ6ICdzdGFydCB3aXRoIFxcJyRcXCcnLFxuICAnLic6ICdjb250YWluIFxcJy5cXCcnLFxuICAnXFwwJzogJ2NvbnRhaW4gbnVsbCBieXRlcydcbn07XG5cbi8vIGNoZWNrcyBpZiBhbGwgZmllbGQgbmFtZXMgaW4gYW4gb2JqZWN0IGFyZSB2YWxpZFxuZnVuY3Rpb24gYXNzZXJ0SGFzVmFsaWRGaWVsZE5hbWVzKGRvYykge1xuICBpZiAoZG9jICYmIHR5cGVvZiBkb2MgPT09ICdvYmplY3QnKSB7XG4gICAgSlNPTi5zdHJpbmdpZnkoZG9jLCAoa2V5LCB2YWx1ZSkgPT4ge1xuICAgICAgYXNzZXJ0SXNWYWxpZEZpZWxkTmFtZShrZXkpO1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFzc2VydElzVmFsaWRGaWVsZE5hbWUoa2V5KSB7XG4gIGxldCBtYXRjaDtcbiAgaWYgKHR5cGVvZiBrZXkgPT09ICdzdHJpbmcnICYmIChtYXRjaCA9IGtleS5tYXRjaCgvXlxcJHxcXC58XFwwLykpKSB7XG4gICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoYEtleSAke2tleX0gbXVzdCBub3QgJHtpbnZhbGlkQ2hhck1zZ1ttYXRjaFswXV19YCk7XG4gIH1cbn1cblxuLy8gZm9yIGEuYi5jLjIuZC5lLCBrZXlwYXJ0cyBzaG91bGQgYmUgWydhJywgJ2InLCAnYycsICcyJywgJ2QnLCAnZSddLFxuLy8gYW5kIHRoZW4geW91IHdvdWxkIG9wZXJhdGUgb24gdGhlICdlJyBwcm9wZXJ0eSBvZiB0aGUgcmV0dXJuZWRcbi8vIG9iamVjdC5cbi8vXG4vLyBpZiBvcHRpb25zLm5vQ3JlYXRlIGlzIGZhbHNleSwgY3JlYXRlcyBpbnRlcm1lZGlhdGUgbGV2ZWxzIG9mXG4vLyBzdHJ1Y3R1cmUgYXMgbmVjZXNzYXJ5LCBsaWtlIG1rZGlyIC1wIChhbmQgcmFpc2VzIGFuIGV4Y2VwdGlvbiBpZlxuLy8gdGhhdCB3b3VsZCBtZWFuIGdpdmluZyBhIG5vbi1udW1lcmljIHByb3BlcnR5IHRvIGFuIGFycmF5LikgaWZcbi8vIG9wdGlvbnMubm9DcmVhdGUgaXMgdHJ1ZSwgcmV0dXJuIHVuZGVmaW5lZCBpbnN0ZWFkLlxuLy9cbi8vIG1heSBtb2RpZnkgdGhlIGxhc3QgZWxlbWVudCBvZiBrZXlwYXJ0cyB0byBzaWduYWwgdG8gdGhlIGNhbGxlciB0aGF0IGl0IG5lZWRzXG4vLyB0byB1c2UgYSBkaWZmZXJlbnQgdmFsdWUgdG8gaW5kZXggaW50byB0aGUgcmV0dXJuZWQgb2JqZWN0IChmb3IgZXhhbXBsZSxcbi8vIFsnYScsICcwMSddIC0+IFsnYScsIDFdKS5cbi8vXG4vLyBpZiBmb3JiaWRBcnJheSBpcyB0cnVlLCByZXR1cm4gbnVsbCBpZiB0aGUga2V5cGF0aCBnb2VzIHRocm91Z2ggYW4gYXJyYXkuXG4vL1xuLy8gaWYgb3B0aW9ucy5hcnJheUluZGljZXMgaXMgc2V0LCB1c2UgaXRzIGZpcnN0IGVsZW1lbnQgZm9yIHRoZSAoZmlyc3QpICckJyBpblxuLy8gdGhlIHBhdGguXG5mdW5jdGlvbiBmaW5kTW9kVGFyZ2V0KGRvYywga2V5cGFydHMsIG9wdGlvbnMgPSB7fSkge1xuICBsZXQgdXNlZEFycmF5SW5kZXggPSBmYWxzZTtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgbGFzdCA9IGkgPT09IGtleXBhcnRzLmxlbmd0aCAtIDE7XG4gICAgbGV0IGtleXBhcnQgPSBrZXlwYXJ0c1tpXTtcblxuICAgIGlmICghaXNJbmRleGFibGUoZG9jKSkge1xuICAgICAgaWYgKG9wdGlvbnMubm9DcmVhdGUpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZXJyb3IgPSBNaW5pbW9uZ29FcnJvcihcbiAgICAgICAgYGNhbm5vdCB1c2UgdGhlIHBhcnQgJyR7a2V5cGFydH0nIHRvIHRyYXZlcnNlICR7ZG9jfWBcbiAgICAgICk7XG4gICAgICBlcnJvci5zZXRQcm9wZXJ0eUVycm9yID0gdHJ1ZTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cblxuICAgIGlmIChkb2MgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgaWYgKG9wdGlvbnMuZm9yYmlkQXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIGlmIChrZXlwYXJ0ID09PSAnJCcpIHtcbiAgICAgICAgaWYgKHVzZWRBcnJheUluZGV4KSB7XG4gICAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoJ1RvbyBtYW55IHBvc2l0aW9uYWwgKGkuZS4gXFwnJFxcJykgZWxlbWVudHMnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghb3B0aW9ucy5hcnJheUluZGljZXMgfHwgIW9wdGlvbnMuYXJyYXlJbmRpY2VzLmxlbmd0aCkge1xuICAgICAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAgICAgJ1RoZSBwb3NpdGlvbmFsIG9wZXJhdG9yIGRpZCBub3QgZmluZCB0aGUgbWF0Y2ggbmVlZGVkIGZyb20gdGhlICcgK1xuICAgICAgICAgICAgJ3F1ZXJ5J1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBrZXlwYXJ0ID0gb3B0aW9ucy5hcnJheUluZGljZXNbMF07XG4gICAgICAgIHVzZWRBcnJheUluZGV4ID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljS2V5KGtleXBhcnQpKSB7XG4gICAgICAgIGtleXBhcnQgPSBwYXJzZUludChrZXlwYXJ0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChvcHRpb25zLm5vQ3JlYXRlKSB7XG4gICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IE1pbmltb25nb0Vycm9yKFxuICAgICAgICAgIGBjYW4ndCBhcHBlbmQgdG8gYXJyYXkgdXNpbmcgc3RyaW5nIGZpZWxkIG5hbWUgWyR7a2V5cGFydH1dYFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAobGFzdCkge1xuICAgICAgICBrZXlwYXJ0c1tpXSA9IGtleXBhcnQ7IC8vIGhhbmRsZSAnYS4wMSdcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMubm9DcmVhdGUgJiYga2V5cGFydCA+PSBkb2MubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG5cbiAgICAgIHdoaWxlIChkb2MubGVuZ3RoIDwga2V5cGFydCkge1xuICAgICAgICBkb2MucHVzaChudWxsKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFsYXN0KSB7XG4gICAgICAgIGlmIChkb2MubGVuZ3RoID09PSBrZXlwYXJ0KSB7XG4gICAgICAgICAgZG9jLnB1c2goe30pO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkb2Nba2V5cGFydF0gIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgdGhyb3cgTWluaW1vbmdvRXJyb3IoXG4gICAgICAgICAgICBgY2FuJ3QgbW9kaWZ5IGZpZWxkICcke2tleXBhcnRzW2kgKyAxXX0nIG9mIGxpc3QgdmFsdWUgYCArXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShkb2Nba2V5cGFydF0pXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBhc3NlcnRJc1ZhbGlkRmllbGROYW1lKGtleXBhcnQpO1xuXG4gICAgICBpZiAoIShrZXlwYXJ0IGluIGRvYykpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMubm9DcmVhdGUpIHtcbiAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFsYXN0KSB7XG4gICAgICAgICAgZG9jW2tleXBhcnRdID0ge307XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobGFzdCkge1xuICAgICAgcmV0dXJuIGRvYztcbiAgICB9XG5cbiAgICBkb2MgPSBkb2Nba2V5cGFydF07XG4gIH1cblxuICAvLyBub3RyZWFjaGVkXG59XG4iLCJpbXBvcnQgTG9jYWxDb2xsZWN0aW9uIGZyb20gJy4vbG9jYWxfY29sbGVjdGlvbi5qcyc7XG5pbXBvcnQge1xuICBjb21waWxlRG9jdW1lbnRTZWxlY3RvcixcbiAgaGFzT3duLFxuICBub3RoaW5nTWF0Y2hlcixcbn0gZnJvbSAnLi9jb21tb24uanMnO1xuXG5jb25zdCBEZWNpbWFsID0gUGFja2FnZVsnbW9uZ28tZGVjaW1hbCddPy5EZWNpbWFsIHx8IGNsYXNzIERlY2ltYWxTdHViIHt9XG5cbi8vIFRoZSBtaW5pbW9uZ28gc2VsZWN0b3IgY29tcGlsZXIhXG5cbi8vIFRlcm1pbm9sb2d5OlxuLy8gIC0gYSAnc2VsZWN0b3InIGlzIHRoZSBFSlNPTiBvYmplY3QgcmVwcmVzZW50aW5nIGEgc2VsZWN0b3Jcbi8vICAtIGEgJ21hdGNoZXInIGlzIGl0cyBjb21waWxlZCBmb3JtICh3aGV0aGVyIGEgZnVsbCBNaW5pbW9uZ28uTWF0Y2hlclxuLy8gICAgb2JqZWN0IG9yIG9uZSBvZiB0aGUgY29tcG9uZW50IGxhbWJkYXMgdGhhdCBtYXRjaGVzIHBhcnRzIG9mIGl0KVxuLy8gIC0gYSAncmVzdWx0IG9iamVjdCcgaXMgYW4gb2JqZWN0IHdpdGggYSAncmVzdWx0JyBmaWVsZCBhbmQgbWF5YmVcbi8vICAgIGRpc3RhbmNlIGFuZCBhcnJheUluZGljZXMuXG4vLyAgLSBhICdicmFuY2hlZCB2YWx1ZScgaXMgYW4gb2JqZWN0IHdpdGggYSAndmFsdWUnIGZpZWxkIGFuZCBtYXliZVxuLy8gICAgJ2RvbnRJdGVyYXRlJyBhbmQgJ2FycmF5SW5kaWNlcycuXG4vLyAgLSBhICdkb2N1bWVudCcgaXMgYSB0b3AtbGV2ZWwgb2JqZWN0IHRoYXQgY2FuIGJlIHN0b3JlZCBpbiBhIGNvbGxlY3Rpb24uXG4vLyAgLSBhICdsb29rdXAgZnVuY3Rpb24nIGlzIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBpbiBhIGRvY3VtZW50IGFuZCByZXR1cm5zXG4vLyAgICBhbiBhcnJheSBvZiAnYnJhbmNoZWQgdmFsdWVzJy5cbi8vICAtIGEgJ2JyYW5jaGVkIG1hdGNoZXInIG1hcHMgZnJvbSBhbiBhcnJheSBvZiBicmFuY2hlZCB2YWx1ZXMgdG8gYSByZXN1bHRcbi8vICAgIG9iamVjdC5cbi8vICAtIGFuICdlbGVtZW50IG1hdGNoZXInIG1hcHMgZnJvbSBhIHNpbmdsZSB2YWx1ZSB0byBhIGJvb2wuXG5cbi8vIE1haW4gZW50cnkgcG9pbnQuXG4vLyAgIHZhciBtYXRjaGVyID0gbmV3IE1pbmltb25nby5NYXRjaGVyKHthOiB7JGd0OiA1fX0pO1xuLy8gICBpZiAobWF0Y2hlci5kb2N1bWVudE1hdGNoZXMoe2E6IDd9KSkgLi4uXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXRjaGVyIHtcbiAgY29uc3RydWN0b3Ioc2VsZWN0b3IsIGlzVXBkYXRlKSB7XG4gICAgLy8gQSBzZXQgKG9iamVjdCBtYXBwaW5nIHN0cmluZyAtPiAqKSBvZiBhbGwgb2YgdGhlIGRvY3VtZW50IHBhdGhzIGxvb2tlZFxuICAgIC8vIGF0IGJ5IHRoZSBzZWxlY3Rvci4gQWxzbyBpbmNsdWRlcyB0aGUgZW1wdHkgc3RyaW5nIGlmIGl0IG1heSBsb29rIGF0IGFueVxuICAgIC8vIHBhdGggKGVnLCAkd2hlcmUpLlxuICAgIHRoaXMuX3BhdGhzID0ge307XG4gICAgLy8gU2V0IHRvIHRydWUgaWYgY29tcGlsYXRpb24gZmluZHMgYSAkbmVhci5cbiAgICB0aGlzLl9oYXNHZW9RdWVyeSA9IGZhbHNlO1xuICAgIC8vIFNldCB0byB0cnVlIGlmIGNvbXBpbGF0aW9uIGZpbmRzIGEgJHdoZXJlLlxuICAgIHRoaXMuX2hhc1doZXJlID0gZmFsc2U7XG4gICAgLy8gU2V0IHRvIGZhbHNlIGlmIGNvbXBpbGF0aW9uIGZpbmRzIGFueXRoaW5nIG90aGVyIHRoYW4gYSBzaW1wbGUgZXF1YWxpdHlcbiAgICAvLyBvciBvbmUgb3IgbW9yZSBvZiAnJGd0JywgJyRndGUnLCAnJGx0JywgJyRsdGUnLCAnJG5lJywgJyRpbicsICckbmluJyB1c2VkXG4gICAgLy8gd2l0aCBzY2FsYXJzIGFzIG9wZXJhbmRzLlxuICAgIHRoaXMuX2lzU2ltcGxlID0gdHJ1ZTtcbiAgICAvLyBTZXQgdG8gYSBkdW1teSBkb2N1bWVudCB3aGljaCBhbHdheXMgbWF0Y2hlcyB0aGlzIE1hdGNoZXIuIE9yIHNldCB0byBudWxsXG4gICAgLy8gaWYgc3VjaCBkb2N1bWVudCBpcyB0b28gaGFyZCB0byBmaW5kLlxuICAgIHRoaXMuX21hdGNoaW5nRG9jdW1lbnQgPSB1bmRlZmluZWQ7XG4gICAgLy8gQSBjbG9uZSBvZiB0aGUgb3JpZ2luYWwgc2VsZWN0b3IuIEl0IG1heSBqdXN0IGJlIGEgZnVuY3Rpb24gaWYgdGhlIHVzZXJcbiAgICAvLyBwYXNzZWQgaW4gYSBmdW5jdGlvbjsgb3RoZXJ3aXNlIGlzIGRlZmluaXRlbHkgYW4gb2JqZWN0IChlZywgSURzIGFyZVxuICAgIC8vIHRyYW5zbGF0ZWQgaW50byB7X2lkOiBJRH0gZmlyc3QuIFVzZWQgYnkgY2FuQmVjb21lVHJ1ZUJ5TW9kaWZpZXIgYW5kXG4gICAgLy8gU29ydGVyLl91c2VXaXRoTWF0Y2hlci5cbiAgICB0aGlzLl9zZWxlY3RvciA9IG51bGw7XG4gICAgdGhpcy5fZG9jTWF0Y2hlciA9IHRoaXMuX2NvbXBpbGVTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgLy8gU2V0IHRvIHRydWUgaWYgc2VsZWN0aW9uIGlzIGRvbmUgZm9yIGFuIHVwZGF0ZSBvcGVyYXRpb25cbiAgICAvLyBEZWZhdWx0IGlzIGZhbHNlXG4gICAgLy8gVXNlZCBmb3IgJG5lYXIgYXJyYXkgdXBkYXRlIChpc3N1ZSAjMzU5OSlcbiAgICB0aGlzLl9pc1VwZGF0ZSA9IGlzVXBkYXRlO1xuICB9XG5cbiAgZG9jdW1lbnRNYXRjaGVzKGRvYykge1xuICAgIGlmIChkb2MgIT09IE9iamVjdChkb2MpKSB7XG4gICAgICB0aHJvdyBFcnJvcignZG9jdW1lbnRNYXRjaGVzIG5lZWRzIGEgZG9jdW1lbnQnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fZG9jTWF0Y2hlcihkb2MpO1xuICB9XG5cbiAgaGFzR2VvUXVlcnkoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2hhc0dlb1F1ZXJ5O1xuICB9XG5cbiAgaGFzV2hlcmUoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2hhc1doZXJlO1xuICB9XG5cbiAgaXNTaW1wbGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2lzU2ltcGxlO1xuICB9XG5cbiAgLy8gR2l2ZW4gYSBzZWxlY3RvciwgcmV0dXJuIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBvbmUgYXJndW1lbnQsIGFcbiAgLy8gZG9jdW1lbnQuIEl0IHJldHVybnMgYSByZXN1bHQgb2JqZWN0LlxuICBfY29tcGlsZVNlbGVjdG9yKHNlbGVjdG9yKSB7XG4gICAgLy8geW91IGNhbiBwYXNzIGEgbGl0ZXJhbCBmdW5jdGlvbiBpbnN0ZWFkIG9mIGEgc2VsZWN0b3JcbiAgICBpZiAoc2VsZWN0b3IgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgdGhpcy5faXNTaW1wbGUgPSBmYWxzZTtcbiAgICAgIHRoaXMuX3NlbGVjdG9yID0gc2VsZWN0b3I7XG4gICAgICB0aGlzLl9yZWNvcmRQYXRoVXNlZCgnJyk7XG5cbiAgICAgIHJldHVybiBkb2MgPT4gKHtyZXN1bHQ6ICEhc2VsZWN0b3IuY2FsbChkb2MpfSk7XG4gICAgfVxuXG4gICAgLy8gc2hvcnRoYW5kIC0tIHNjYWxhciBfaWRcbiAgICBpZiAoTG9jYWxDb2xsZWN0aW9uLl9zZWxlY3RvcklzSWQoc2VsZWN0b3IpKSB7XG4gICAgICB0aGlzLl9zZWxlY3RvciA9IHtfaWQ6IHNlbGVjdG9yfTtcbiAgICAgIHRoaXMuX3JlY29yZFBhdGhVc2VkKCdfaWQnKTtcblxuICAgICAgcmV0dXJuIGRvYyA9PiAoe3Jlc3VsdDogRUpTT04uZXF1YWxzKGRvYy5faWQsIHNlbGVjdG9yKX0pO1xuICAgIH1cblxuICAgIC8vIHByb3RlY3QgYWdhaW5zdCBkYW5nZXJvdXMgc2VsZWN0b3JzLiAgZmFsc2V5IGFuZCB7X2lkOiBmYWxzZXl9IGFyZSBib3RoXG4gICAgLy8gbGlrZWx5IHByb2dyYW1tZXIgZXJyb3IsIGFuZCBub3Qgd2hhdCB5b3Ugd2FudCwgcGFydGljdWxhcmx5IGZvclxuICAgIC8vIGRlc3RydWN0aXZlIG9wZXJhdGlvbnMuXG4gICAgaWYgKCFzZWxlY3RvciB8fCBoYXNPd24uY2FsbChzZWxlY3RvciwgJ19pZCcpICYmICFzZWxlY3Rvci5faWQpIHtcbiAgICAgIHRoaXMuX2lzU2ltcGxlID0gZmFsc2U7XG4gICAgICByZXR1cm4gbm90aGluZ01hdGNoZXI7XG4gICAgfVxuXG4gICAgLy8gVG9wIGxldmVsIGNhbid0IGJlIGFuIGFycmF5IG9yIHRydWUgb3IgYmluYXJ5LlxuICAgIGlmIChBcnJheS5pc0FycmF5KHNlbGVjdG9yKSB8fFxuICAgICAgICBFSlNPTi5pc0JpbmFyeShzZWxlY3RvcikgfHxcbiAgICAgICAgdHlwZW9mIHNlbGVjdG9yID09PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBzZWxlY3RvcjogJHtzZWxlY3Rvcn1gKTtcbiAgICB9XG5cbiAgICB0aGlzLl9zZWxlY3RvciA9IEVKU09OLmNsb25lKHNlbGVjdG9yKTtcblxuICAgIHJldHVybiBjb21waWxlRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgdGhpcywge2lzUm9vdDogdHJ1ZX0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2Yga2V5IHBhdGhzIHRoZSBnaXZlbiBzZWxlY3RvciBpcyBsb29raW5nIGZvci4gSXQgaW5jbHVkZXNcbiAgLy8gdGhlIGVtcHR5IHN0cmluZyBpZiB0aGVyZSBpcyBhICR3aGVyZS5cbiAgX2dldFBhdGhzKCkge1xuICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl9wYXRocyk7XG4gIH1cblxuICBfcmVjb3JkUGF0aFVzZWQocGF0aCkge1xuICAgIHRoaXMuX3BhdGhzW3BhdGhdID0gdHJ1ZTtcbiAgfVxufVxuXG4vLyBoZWxwZXJzIHVzZWQgYnkgY29tcGlsZWQgc2VsZWN0b3IgY29kZVxuTG9jYWxDb2xsZWN0aW9uLl9mID0ge1xuICAvLyBYWFggZm9yIF9hbGwgYW5kIF9pbiwgY29uc2lkZXIgYnVpbGRpbmcgJ2lucXVlcnknIGF0IGNvbXBpbGUgdGltZS4uXG4gIF90eXBlKHYpIHtcbiAgICBpZiAodHlwZW9mIHYgPT09ICdudW1iZXInKSB7XG4gICAgICByZXR1cm4gMTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHYgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gMjtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHYgPT09ICdib29sZWFuJykge1xuICAgICAgcmV0dXJuIDg7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkodikpIHtcbiAgICAgIHJldHVybiA0O1xuICAgIH1cblxuICAgIGlmICh2ID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gMTA7XG4gICAgfVxuXG4gICAgLy8gbm90ZSB0aGF0IHR5cGVvZigveC8pID09PSBcIm9iamVjdFwiXG4gICAgaWYgKHYgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgIHJldHVybiAxMTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHYgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiAxMztcbiAgICB9XG5cbiAgICBpZiAodiBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiA5O1xuICAgIH1cblxuICAgIGlmIChFSlNPTi5pc0JpbmFyeSh2KSkge1xuICAgICAgcmV0dXJuIDU7XG4gICAgfVxuXG4gICAgaWYgKHYgaW5zdGFuY2VvZiBNb25nb0lELk9iamVjdElEKSB7XG4gICAgICByZXR1cm4gNztcbiAgICB9XG5cbiAgICBpZiAodiBpbnN0YW5jZW9mIERlY2ltYWwpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cblxuICAgIC8vIG9iamVjdFxuICAgIHJldHVybiAzO1xuXG4gICAgLy8gWFhYIHN1cHBvcnQgc29tZS9hbGwgb2YgdGhlc2U6XG4gICAgLy8gMTQsIHN5bWJvbFxuICAgIC8vIDE1LCBqYXZhc2NyaXB0IGNvZGUgd2l0aCBzY29wZVxuICAgIC8vIDE2LCAxODogMzItYml0LzY0LWJpdCBpbnRlZ2VyXG4gICAgLy8gMTcsIHRpbWVzdGFtcFxuICAgIC8vIDI1NSwgbWlua2V5XG4gICAgLy8gMTI3LCBtYXhrZXlcbiAgfSxcblxuICAvLyBkZWVwIGVxdWFsaXR5IHRlc3Q6IHVzZSBmb3IgbGl0ZXJhbCBkb2N1bWVudCBhbmQgYXJyYXkgbWF0Y2hlc1xuICBfZXF1YWwoYSwgYikge1xuICAgIHJldHVybiBFSlNPTi5lcXVhbHMoYSwgYiwge2tleU9yZGVyU2Vuc2l0aXZlOiB0cnVlfSk7XG4gIH0sXG5cbiAgLy8gbWFwcyBhIHR5cGUgY29kZSB0byBhIHZhbHVlIHRoYXQgY2FuIGJlIHVzZWQgdG8gc29ydCB2YWx1ZXMgb2YgZGlmZmVyZW50XG4gIC8vIHR5cGVzXG4gIF90eXBlb3JkZXIodCkge1xuICAgIC8vIGh0dHA6Ly93d3cubW9uZ29kYi5vcmcvZGlzcGxheS9ET0NTL1doYXQraXMrdGhlK0NvbXBhcmUrT3JkZXIrZm9yK0JTT04rVHlwZXNcbiAgICAvLyBYWFggd2hhdCBpcyB0aGUgY29ycmVjdCBzb3J0IHBvc2l0aW9uIGZvciBKYXZhc2NyaXB0IGNvZGU/XG4gICAgLy8gKCcxMDAnIGluIHRoZSBtYXRyaXggYmVsb3cpXG4gICAgLy8gWFhYIG1pbmtleS9tYXhrZXlcbiAgICByZXR1cm4gW1xuICAgICAgLTEsICAvLyAobm90IGEgdHlwZSlcbiAgICAgIDEsICAgLy8gbnVtYmVyXG4gICAgICAyLCAgIC8vIHN0cmluZ1xuICAgICAgMywgICAvLyBvYmplY3RcbiAgICAgIDQsICAgLy8gYXJyYXlcbiAgICAgIDUsICAgLy8gYmluYXJ5XG4gICAgICAtMSwgIC8vIGRlcHJlY2F0ZWRcbiAgICAgIDYsICAgLy8gT2JqZWN0SURcbiAgICAgIDcsICAgLy8gYm9vbFxuICAgICAgOCwgICAvLyBEYXRlXG4gICAgICAwLCAgIC8vIG51bGxcbiAgICAgIDksICAgLy8gUmVnRXhwXG4gICAgICAtMSwgIC8vIGRlcHJlY2F0ZWRcbiAgICAgIDEwMCwgLy8gSlMgY29kZVxuICAgICAgMiwgICAvLyBkZXByZWNhdGVkIChzeW1ib2wpXG4gICAgICAxMDAsIC8vIEpTIGNvZGVcbiAgICAgIDEsICAgLy8gMzItYml0IGludFxuICAgICAgOCwgICAvLyBNb25nbyB0aW1lc3RhbXBcbiAgICAgIDEgICAgLy8gNjQtYml0IGludFxuICAgIF1bdF07XG4gIH0sXG5cbiAgLy8gY29tcGFyZSB0d28gdmFsdWVzIG9mIHVua25vd24gdHlwZSBhY2NvcmRpbmcgdG8gQlNPTiBvcmRlcmluZ1xuICAvLyBzZW1hbnRpY3MuIChhcyBhbiBleHRlbnNpb24sIGNvbnNpZGVyICd1bmRlZmluZWQnIHRvIGJlIGxlc3MgdGhhblxuICAvLyBhbnkgb3RoZXIgdmFsdWUuKSByZXR1cm4gbmVnYXRpdmUgaWYgYSBpcyBsZXNzLCBwb3NpdGl2ZSBpZiBiIGlzXG4gIC8vIGxlc3MsIG9yIDAgaWYgZXF1YWxcbiAgX2NtcChhLCBiKSB7XG4gICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIGIgPT09IHVuZGVmaW5lZCA/IDAgOiAtMTtcbiAgICB9XG5cbiAgICBpZiAoYiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gMTtcbiAgICB9XG5cbiAgICBsZXQgdGEgPSBMb2NhbENvbGxlY3Rpb24uX2YuX3R5cGUoYSk7XG4gICAgbGV0IHRiID0gTG9jYWxDb2xsZWN0aW9uLl9mLl90eXBlKGIpO1xuXG4gICAgY29uc3Qgb2EgPSBMb2NhbENvbGxlY3Rpb24uX2YuX3R5cGVvcmRlcih0YSk7XG4gICAgY29uc3Qgb2IgPSBMb2NhbENvbGxlY3Rpb24uX2YuX3R5cGVvcmRlcih0Yik7XG5cbiAgICBpZiAob2EgIT09IG9iKSB7XG4gICAgICByZXR1cm4gb2EgPCBvYiA/IC0xIDogMTtcbiAgICB9XG5cbiAgICAvLyBYWFggbmVlZCB0byBpbXBsZW1lbnQgdGhpcyBpZiB3ZSBpbXBsZW1lbnQgU3ltYm9sIG9yIGludGVnZXJzLCBvclxuICAgIC8vIFRpbWVzdGFtcFxuICAgIGlmICh0YSAhPT0gdGIpIHtcbiAgICAgIHRocm93IEVycm9yKCdNaXNzaW5nIHR5cGUgY29lcmNpb24gbG9naWMgaW4gX2NtcCcpO1xuICAgIH1cblxuICAgIGlmICh0YSA9PT0gNykgeyAvLyBPYmplY3RJRFxuICAgICAgLy8gQ29udmVydCB0byBzdHJpbmcuXG4gICAgICB0YSA9IHRiID0gMjtcbiAgICAgIGEgPSBhLnRvSGV4U3RyaW5nKCk7XG4gICAgICBiID0gYi50b0hleFN0cmluZygpO1xuICAgIH1cblxuICAgIGlmICh0YSA9PT0gOSkgeyAvLyBEYXRlXG4gICAgICAvLyBDb252ZXJ0IHRvIG1pbGxpcy5cbiAgICAgIHRhID0gdGIgPSAxO1xuICAgICAgYSA9IGlzTmFOKGEpID8gMCA6IGEuZ2V0VGltZSgpO1xuICAgICAgYiA9IGlzTmFOKGIpID8gMCA6IGIuZ2V0VGltZSgpO1xuICAgIH1cblxuICAgIGlmICh0YSA9PT0gMSkgeyAvLyBkb3VibGVcbiAgICAgIGlmIChhIGluc3RhbmNlb2YgRGVjaW1hbCkge1xuICAgICAgICByZXR1cm4gYS5taW51cyhiKS50b051bWJlcigpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGEgLSBiO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0YiA9PT0gMikgLy8gc3RyaW5nXG4gICAgICByZXR1cm4gYSA8IGIgPyAtMSA6IGEgPT09IGIgPyAwIDogMTtcblxuICAgIGlmICh0YSA9PT0gMykgeyAvLyBPYmplY3RcbiAgICAgIC8vIHRoaXMgY291bGQgYmUgbXVjaCBtb3JlIGVmZmljaWVudCBpbiB0aGUgZXhwZWN0ZWQgY2FzZSAuLi5cbiAgICAgIGNvbnN0IHRvQXJyYXkgPSBvYmplY3QgPT4ge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBbXTtcblxuICAgICAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICByZXN1bHQucHVzaChrZXksIG9iamVjdFtrZXldKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH07XG5cbiAgICAgIHJldHVybiBMb2NhbENvbGxlY3Rpb24uX2YuX2NtcCh0b0FycmF5KGEpLCB0b0FycmF5KGIpKTtcbiAgICB9XG5cbiAgICBpZiAodGEgPT09IDQpIHsgLy8gQXJyYXlcbiAgICAgIGZvciAobGV0IGkgPSAwOyA7IGkrKykge1xuICAgICAgICBpZiAoaSA9PT0gYS5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm4gaSA9PT0gYi5sZW5ndGggPyAwIDogLTE7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaSA9PT0gYi5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHMgPSBMb2NhbENvbGxlY3Rpb24uX2YuX2NtcChhW2ldLCBiW2ldKTtcbiAgICAgICAgaWYgKHMgIT09IDApIHtcbiAgICAgICAgICByZXR1cm4gcztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0YSA9PT0gNSkgeyAvLyBiaW5hcnlcbiAgICAgIC8vIFN1cnByaXNpbmdseSwgYSBzbWFsbCBiaW5hcnkgYmxvYiBpcyBhbHdheXMgbGVzcyB0aGFuIGEgbGFyZ2Ugb25lIGluXG4gICAgICAvLyBNb25nby5cbiAgICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7XG4gICAgICB9XG5cbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoYVtpXSA8IGJbaV0pIHtcbiAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYVtpXSA+IGJbaV0pIHtcbiAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBpZiAodGEgPT09IDgpIHsgLy8gYm9vbGVhblxuICAgICAgaWYgKGEpIHtcbiAgICAgICAgcmV0dXJuIGIgPyAwIDogMTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGIgPyAtMSA6IDA7XG4gICAgfVxuXG4gICAgaWYgKHRhID09PSAxMCkgLy8gbnVsbFxuICAgICAgcmV0dXJuIDA7XG5cbiAgICBpZiAodGEgPT09IDExKSAvLyByZWdleHBcbiAgICAgIHRocm93IEVycm9yKCdTb3J0aW5nIG5vdCBzdXBwb3J0ZWQgb24gcmVndWxhciBleHByZXNzaW9uJyk7IC8vIFhYWFxuXG4gICAgLy8gMTM6IGphdmFzY3JpcHQgY29kZVxuICAgIC8vIDE0OiBzeW1ib2xcbiAgICAvLyAxNTogamF2YXNjcmlwdCBjb2RlIHdpdGggc2NvcGVcbiAgICAvLyAxNjogMzItYml0IGludGVnZXJcbiAgICAvLyAxNzogdGltZXN0YW1wXG4gICAgLy8gMTg6IDY0LWJpdCBpbnRlZ2VyXG4gICAgLy8gMjU1OiBtaW5rZXlcbiAgICAvLyAxMjc6IG1heGtleVxuICAgIGlmICh0YSA9PT0gMTMpIC8vIGphdmFzY3JpcHQgY29kZVxuICAgICAgdGhyb3cgRXJyb3IoJ1NvcnRpbmcgbm90IHN1cHBvcnRlZCBvbiBKYXZhc2NyaXB0IGNvZGUnKTsgLy8gWFhYXG5cbiAgICB0aHJvdyBFcnJvcignVW5rbm93biB0eXBlIHRvIHNvcnQnKTtcbiAgfSxcbn07XG4iLCJpbXBvcnQgTG9jYWxDb2xsZWN0aW9uXyBmcm9tICcuL2xvY2FsX2NvbGxlY3Rpb24uanMnO1xuaW1wb3J0IE1hdGNoZXIgZnJvbSAnLi9tYXRjaGVyLmpzJztcbmltcG9ydCBTb3J0ZXIgZnJvbSAnLi9zb3J0ZXIuanMnO1xuXG5Mb2NhbENvbGxlY3Rpb24gPSBMb2NhbENvbGxlY3Rpb25fO1xuTWluaW1vbmdvID0ge1xuICAgIExvY2FsQ29sbGVjdGlvbjogTG9jYWxDb2xsZWN0aW9uXyxcbiAgICBNYXRjaGVyLFxuICAgIFNvcnRlclxufTtcbiIsIi8vIE9ic2VydmVIYW5kbGU6IHRoZSByZXR1cm4gdmFsdWUgb2YgYSBsaXZlIHF1ZXJ5LlxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgT2JzZXJ2ZUhhbmRsZSB7fVxuIiwiaW1wb3J0IHtcbiAgRUxFTUVOVF9PUEVSQVRPUlMsXG4gIGVxdWFsaXR5RWxlbWVudE1hdGNoZXIsXG4gIGV4cGFuZEFycmF5c0luQnJhbmNoZXMsXG4gIGhhc093bixcbiAgaXNPcGVyYXRvck9iamVjdCxcbiAgbWFrZUxvb2t1cEZ1bmN0aW9uLFxuICByZWdleHBFbGVtZW50TWF0Y2hlcixcbn0gZnJvbSAnLi9jb21tb24uanMnO1xuXG4vLyBHaXZlIGEgc29ydCBzcGVjLCB3aGljaCBjYW4gYmUgaW4gYW55IG9mIHRoZXNlIGZvcm1zOlxuLy8gICB7XCJrZXkxXCI6IDEsIFwia2V5MlwiOiAtMX1cbi8vICAgW1tcImtleTFcIiwgXCJhc2NcIl0sIFtcImtleTJcIiwgXCJkZXNjXCJdXVxuLy8gICBbXCJrZXkxXCIsIFtcImtleTJcIiwgXCJkZXNjXCJdXVxuLy9cbi8vICguLiB3aXRoIHRoZSBmaXJzdCBmb3JtIGJlaW5nIGRlcGVuZGVudCBvbiB0aGUga2V5IGVudW1lcmF0aW9uXG4vLyBiZWhhdmlvciBvZiB5b3VyIGphdmFzY3JpcHQgVk0sIHdoaWNoIHVzdWFsbHkgZG9lcyB3aGF0IHlvdSBtZWFuIGluXG4vLyB0aGlzIGNhc2UgaWYgdGhlIGtleSBuYW1lcyBkb24ndCBsb29rIGxpa2UgaW50ZWdlcnMgLi4pXG4vL1xuLy8gcmV0dXJuIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyB0d28gb2JqZWN0cywgYW5kIHJldHVybnMgLTEgaWYgdGhlXG4vLyBmaXJzdCBvYmplY3QgY29tZXMgZmlyc3QgaW4gb3JkZXIsIDEgaWYgdGhlIHNlY29uZCBvYmplY3QgY29tZXNcbi8vIGZpcnN0LCBvciAwIGlmIG5laXRoZXIgb2JqZWN0IGNvbWVzIGJlZm9yZSB0aGUgb3RoZXIuXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNvcnRlciB7XG4gIGNvbnN0cnVjdG9yKHNwZWMpIHtcbiAgICB0aGlzLl9zb3J0U3BlY1BhcnRzID0gW107XG4gICAgdGhpcy5fc29ydEZ1bmN0aW9uID0gbnVsbDtcblxuICAgIGNvbnN0IGFkZFNwZWNQYXJ0ID0gKHBhdGgsIGFzY2VuZGluZykgPT4ge1xuICAgICAgaWYgKCFwYXRoKSB7XG4gICAgICAgIHRocm93IEVycm9yKCdzb3J0IGtleXMgbXVzdCBiZSBub24tZW1wdHknKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHBhdGguY2hhckF0KDApID09PSAnJCcpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoYHVuc3VwcG9ydGVkIHNvcnQga2V5OiAke3BhdGh9YCk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3NvcnRTcGVjUGFydHMucHVzaCh7XG4gICAgICAgIGFzY2VuZGluZyxcbiAgICAgICAgbG9va3VwOiBtYWtlTG9va3VwRnVuY3Rpb24ocGF0aCwge2ZvclNvcnQ6IHRydWV9KSxcbiAgICAgICAgcGF0aFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIGlmIChzcGVjIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHNwZWMuZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBlbGVtZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGFkZFNwZWNQYXJ0KGVsZW1lbnQsIHRydWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFkZFNwZWNQYXJ0KGVsZW1lbnRbMF0sIGVsZW1lbnRbMV0gIT09ICdkZXNjJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHNwZWMgPT09ICdvYmplY3QnKSB7XG4gICAgICBPYmplY3Qua2V5cyhzcGVjKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgIGFkZFNwZWNQYXJ0KGtleSwgc3BlY1trZXldID49IDApO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc3BlYyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhpcy5fc29ydEZ1bmN0aW9uID0gc3BlYztcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgRXJyb3IoYEJhZCBzb3J0IHNwZWNpZmljYXRpb246ICR7SlNPTi5zdHJpbmdpZnkoc3BlYyl9YCk7XG4gICAgfVxuXG4gICAgLy8gSWYgYSBmdW5jdGlvbiBpcyBzcGVjaWZpZWQgZm9yIHNvcnRpbmcsIHdlIHNraXAgdGhlIHJlc3QuXG4gICAgaWYgKHRoaXMuX3NvcnRGdW5jdGlvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFRvIGltcGxlbWVudCBhZmZlY3RlZEJ5TW9kaWZpZXIsIHdlIHBpZ2d5LWJhY2sgb24gdG9wIG9mIE1hdGNoZXInc1xuICAgIC8vIGFmZmVjdGVkQnlNb2RpZmllciBjb2RlOyB3ZSBjcmVhdGUgYSBzZWxlY3RvciB0aGF0IGlzIGFmZmVjdGVkIGJ5IHRoZVxuICAgIC8vIHNhbWUgbW9kaWZpZXJzIGFzIHRoaXMgc29ydCBvcmRlci4gVGhpcyBpcyBvbmx5IGltcGxlbWVudGVkIG9uIHRoZVxuICAgIC8vIHNlcnZlci5cbiAgICBpZiAodGhpcy5hZmZlY3RlZEJ5TW9kaWZpZXIpIHtcbiAgICAgIGNvbnN0IHNlbGVjdG9yID0ge307XG5cbiAgICAgIHRoaXMuX3NvcnRTcGVjUGFydHMuZm9yRWFjaChzcGVjID0+IHtcbiAgICAgICAgc2VsZWN0b3Jbc3BlYy5wYXRoXSA9IDE7XG4gICAgICB9KTtcblxuICAgICAgdGhpcy5fc2VsZWN0b3JGb3JBZmZlY3RlZEJ5TW9kaWZpZXIgPSBuZXcgTWluaW1vbmdvLk1hdGNoZXIoc2VsZWN0b3IpO1xuICAgIH1cblxuICAgIHRoaXMuX2tleUNvbXBhcmF0b3IgPSBjb21wb3NlQ29tcGFyYXRvcnMoXG4gICAgICB0aGlzLl9zb3J0U3BlY1BhcnRzLm1hcCgoc3BlYywgaSkgPT4gdGhpcy5fa2V5RmllbGRDb21wYXJhdG9yKGkpKVxuICAgICk7XG4gIH1cblxuICBnZXRDb21wYXJhdG9yKG9wdGlvbnMpIHtcbiAgICAvLyBJZiBzb3J0IGlzIHNwZWNpZmllZCBvciBoYXZlIG5vIGRpc3RhbmNlcywganVzdCB1c2UgdGhlIGNvbXBhcmF0b3IgZnJvbVxuICAgIC8vIHRoZSBzb3VyY2Ugc3BlY2lmaWNhdGlvbiAod2hpY2ggZGVmYXVsdHMgdG8gXCJldmVyeXRoaW5nIGlzIGVxdWFsXCIuXG4gICAgLy8gaXNzdWUgIzM1OTlcbiAgICAvLyBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9vcGVyYXRvci9xdWVyeS9uZWFyLyNzb3J0LW9wZXJhdGlvblxuICAgIC8vIHNvcnQgZWZmZWN0aXZlbHkgb3ZlcnJpZGVzICRuZWFyXG4gICAgaWYgKHRoaXMuX3NvcnRTcGVjUGFydHMubGVuZ3RoIHx8ICFvcHRpb25zIHx8ICFvcHRpb25zLmRpc3RhbmNlcykge1xuICAgICAgcmV0dXJuIHRoaXMuX2dldEJhc2VDb21wYXJhdG9yKCk7XG4gICAgfVxuXG4gICAgY29uc3QgZGlzdGFuY2VzID0gb3B0aW9ucy5kaXN0YW5jZXM7XG5cbiAgICAvLyBSZXR1cm4gYSBjb21wYXJhdG9yIHdoaWNoIGNvbXBhcmVzIHVzaW5nICRuZWFyIGRpc3RhbmNlcy5cbiAgICByZXR1cm4gKGEsIGIpID0+IHtcbiAgICAgIGlmICghZGlzdGFuY2VzLmhhcyhhLl9pZCkpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoYE1pc3NpbmcgZGlzdGFuY2UgZm9yICR7YS5faWR9YCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghZGlzdGFuY2VzLmhhcyhiLl9pZCkpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoYE1pc3NpbmcgZGlzdGFuY2UgZm9yICR7Yi5faWR9YCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBkaXN0YW5jZXMuZ2V0KGEuX2lkKSAtIGRpc3RhbmNlcy5nZXQoYi5faWQpO1xuICAgIH07XG4gIH1cblxuICAvLyBUYWtlcyBpbiB0d28ga2V5czogYXJyYXlzIHdob3NlIGxlbmd0aHMgbWF0Y2ggdGhlIG51bWJlciBvZiBzcGVjXG4gIC8vIHBhcnRzLiBSZXR1cm5zIG5lZ2F0aXZlLCAwLCBvciBwb3NpdGl2ZSBiYXNlZCBvbiB1c2luZyB0aGUgc29ydCBzcGVjIHRvXG4gIC8vIGNvbXBhcmUgZmllbGRzLlxuICBfY29tcGFyZUtleXMoa2V5MSwga2V5Mikge1xuICAgIGlmIChrZXkxLmxlbmd0aCAhPT0gdGhpcy5fc29ydFNwZWNQYXJ0cy5sZW5ndGggfHxcbiAgICAgICAga2V5Mi5sZW5ndGggIT09IHRoaXMuX3NvcnRTcGVjUGFydHMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBFcnJvcignS2V5IGhhcyB3cm9uZyBsZW5ndGgnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fa2V5Q29tcGFyYXRvcihrZXkxLCBrZXkyKTtcbiAgfVxuXG4gIC8vIEl0ZXJhdGVzIG92ZXIgZWFjaCBwb3NzaWJsZSBcImtleVwiIGZyb20gZG9jIChpZSwgb3ZlciBlYWNoIGJyYW5jaCksIGNhbGxpbmdcbiAgLy8gJ2NiJyB3aXRoIHRoZSBrZXkuXG4gIF9nZW5lcmF0ZUtleXNGcm9tRG9jKGRvYywgY2IpIHtcbiAgICBpZiAodGhpcy5fc29ydFNwZWNQYXJ0cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignY2FuXFwndCBnZW5lcmF0ZSBrZXlzIHdpdGhvdXQgYSBzcGVjJyk7XG4gICAgfVxuXG4gICAgY29uc3QgcGF0aEZyb21JbmRpY2VzID0gaW5kaWNlcyA9PiBgJHtpbmRpY2VzLmpvaW4oJywnKX0sYDtcblxuICAgIGxldCBrbm93blBhdGhzID0gbnVsbDtcblxuICAgIC8vIG1hcHMgaW5kZXggLT4gKHsnJyAtPiB2YWx1ZX0gb3Ige3BhdGggLT4gdmFsdWV9KVxuICAgIGNvbnN0IHZhbHVlc0J5SW5kZXhBbmRQYXRoID0gdGhpcy5fc29ydFNwZWNQYXJ0cy5tYXAoc3BlYyA9PiB7XG4gICAgICAvLyBFeHBhbmQgYW55IGxlYWYgYXJyYXlzIHRoYXQgd2UgZmluZCwgYW5kIGlnbm9yZSB0aG9zZSBhcnJheXNcbiAgICAgIC8vIHRoZW1zZWx2ZXMuICAoV2UgbmV2ZXIgc29ydCBiYXNlZCBvbiBhbiBhcnJheSBpdHNlbGYuKVxuICAgICAgbGV0IGJyYW5jaGVzID0gZXhwYW5kQXJyYXlzSW5CcmFuY2hlcyhzcGVjLmxvb2t1cChkb2MpLCB0cnVlKTtcblxuICAgICAgLy8gSWYgdGhlcmUgYXJlIG5vIHZhbHVlcyBmb3IgYSBrZXkgKGVnLCBrZXkgZ29lcyB0byBhbiBlbXB0eSBhcnJheSksXG4gICAgICAvLyBwcmV0ZW5kIHdlIGZvdW5kIG9uZSB1bmRlZmluZWQgdmFsdWUuXG4gICAgICBpZiAoIWJyYW5jaGVzLmxlbmd0aCkge1xuICAgICAgICBicmFuY2hlcyA9IFt7IHZhbHVlOiB2b2lkIDAgfV07XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGVsZW1lbnQgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgbGV0IHVzZWRQYXRocyA9IGZhbHNlO1xuXG4gICAgICBicmFuY2hlcy5mb3JFYWNoKGJyYW5jaCA9PiB7XG4gICAgICAgIGlmICghYnJhbmNoLmFycmF5SW5kaWNlcykge1xuICAgICAgICAgIC8vIElmIHRoZXJlIGFyZSBubyBhcnJheSBpbmRpY2VzIGZvciBhIGJyYW5jaCwgdGhlbiBpdCBtdXN0IGJlIHRoZVxuICAgICAgICAgIC8vIG9ubHkgYnJhbmNoLCBiZWNhdXNlIHRoZSBvbmx5IHRoaW5nIHRoYXQgcHJvZHVjZXMgbXVsdGlwbGUgYnJhbmNoZXNcbiAgICAgICAgICAvLyBpcyB0aGUgdXNlIG9mIGFycmF5cy5cbiAgICAgICAgICBpZiAoYnJhbmNoZXMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ211bHRpcGxlIGJyYW5jaGVzIGJ1dCBubyBhcnJheSB1c2VkPycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGVsZW1lbnRbJyddID0gYnJhbmNoLnZhbHVlO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHVzZWRQYXRocyA9IHRydWU7XG5cbiAgICAgICAgY29uc3QgcGF0aCA9IHBhdGhGcm9tSW5kaWNlcyhicmFuY2guYXJyYXlJbmRpY2VzKTtcblxuICAgICAgICBpZiAoaGFzT3duLmNhbGwoZWxlbWVudCwgcGF0aCkpIHtcbiAgICAgICAgICB0aHJvdyBFcnJvcihgZHVwbGljYXRlIHBhdGg6ICR7cGF0aH1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGVsZW1lbnRbcGF0aF0gPSBicmFuY2gudmFsdWU7XG5cbiAgICAgICAgLy8gSWYgdHdvIHNvcnQgZmllbGRzIGJvdGggZ28gaW50byBhcnJheXMsIHRoZXkgaGF2ZSB0byBnbyBpbnRvIHRoZVxuICAgICAgICAvLyBleGFjdCBzYW1lIGFycmF5cyBhbmQgd2UgaGF2ZSB0byBmaW5kIHRoZSBzYW1lIHBhdGhzLiAgVGhpcyBpc1xuICAgICAgICAvLyByb3VnaGx5IHRoZSBzYW1lIGNvbmRpdGlvbiB0aGF0IG1ha2VzIE1vbmdvREIgdGhyb3cgdGhpcyBzdHJhbmdlXG4gICAgICAgIC8vIGVycm9yIG1lc3NhZ2UuICBlZywgdGhlIG1haW4gdGhpbmcgaXMgdGhhdCBpZiBzb3J0IHNwZWMgaXMge2E6IDEsXG4gICAgICAgIC8vIGI6MX0gdGhlbiBhIGFuZCBiIGNhbm5vdCBib3RoIGJlIGFycmF5cy5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gKEluIE1vbmdvREIgaXQgc2VlbXMgdG8gYmUgT0sgdG8gaGF2ZSB7YTogMSwgJ2EueC55JzogMX0gd2hlcmUgJ2EnXG4gICAgICAgIC8vIGFuZCAnYS54LnknIGFyZSBib3RoIGFycmF5cywgYnV0IHdlIGRvbid0IGFsbG93IHRoaXMgZm9yIG5vdy5cbiAgICAgICAgLy8gI05lc3RlZEFycmF5U29ydFxuICAgICAgICAvLyBYWFggYWNoaWV2ZSBmdWxsIGNvbXBhdGliaWxpdHkgaGVyZVxuICAgICAgICBpZiAoa25vd25QYXRocyAmJiAhaGFzT3duLmNhbGwoa25vd25QYXRocywgcGF0aCkpIHtcbiAgICAgICAgICB0aHJvdyBFcnJvcignY2Fubm90IGluZGV4IHBhcmFsbGVsIGFycmF5cycpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgaWYgKGtub3duUGF0aHMpIHtcbiAgICAgICAgLy8gU2ltaWxhcmx5IHRvIGFib3ZlLCBwYXRocyBtdXN0IG1hdGNoIGV2ZXJ5d2hlcmUsIHVubGVzcyB0aGlzIGlzIGFcbiAgICAgICAgLy8gbm9uLWFycmF5IGZpZWxkLlxuICAgICAgICBpZiAoIWhhc093bi5jYWxsKGVsZW1lbnQsICcnKSAmJlxuICAgICAgICAgICAgT2JqZWN0LmtleXMoa25vd25QYXRocykubGVuZ3RoICE9PSBPYmplY3Qua2V5cyhlbGVtZW50KS5sZW5ndGgpIHtcbiAgICAgICAgICB0aHJvdyBFcnJvcignY2Fubm90IGluZGV4IHBhcmFsbGVsIGFycmF5cyEnKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1c2VkUGF0aHMpIHtcbiAgICAgICAga25vd25QYXRocyA9IHt9O1xuXG4gICAgICAgIE9iamVjdC5rZXlzKGVsZW1lbnQpLmZvckVhY2gocGF0aCA9PiB7XG4gICAgICAgICAga25vd25QYXRoc1twYXRoXSA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZWxlbWVudDtcbiAgICB9KTtcblxuICAgIGlmICgha25vd25QYXRocykge1xuICAgICAgLy8gRWFzeSBjYXNlOiBubyB1c2Ugb2YgYXJyYXlzLlxuICAgICAgY29uc3Qgc29sZUtleSA9IHZhbHVlc0J5SW5kZXhBbmRQYXRoLm1hcCh2YWx1ZXMgPT4ge1xuICAgICAgICBpZiAoIWhhc093bi5jYWxsKHZhbHVlcywgJycpKSB7XG4gICAgICAgICAgdGhyb3cgRXJyb3IoJ25vIHZhbHVlIGluIHNvbGUga2V5IGNhc2U/Jyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdmFsdWVzWycnXTtcbiAgICAgIH0pO1xuXG4gICAgICBjYihzb2xlS2V5KTtcblxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKGtub3duUGF0aHMpLmZvckVhY2gocGF0aCA9PiB7XG4gICAgICBjb25zdCBrZXkgPSB2YWx1ZXNCeUluZGV4QW5kUGF0aC5tYXAodmFsdWVzID0+IHtcbiAgICAgICAgaWYgKGhhc093bi5jYWxsKHZhbHVlcywgJycpKSB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlc1snJ107XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWhhc093bi5jYWxsKHZhbHVlcywgcGF0aCkpIHtcbiAgICAgICAgICB0aHJvdyBFcnJvcignbWlzc2luZyBwYXRoPycpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHZhbHVlc1twYXRoXTtcbiAgICAgIH0pO1xuXG4gICAgICBjYihrZXkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIGNvbXBhcmF0b3IgdGhhdCByZXByZXNlbnRzIHRoZSBzb3J0IHNwZWNpZmljYXRpb24gKGJ1dCBub3RcbiAgLy8gaW5jbHVkaW5nIGEgcG9zc2libGUgZ2VvcXVlcnkgZGlzdGFuY2UgdGllLWJyZWFrZXIpLlxuICBfZ2V0QmFzZUNvbXBhcmF0b3IoKSB7XG4gICAgaWYgKHRoaXMuX3NvcnRGdW5jdGlvbikge1xuICAgICAgcmV0dXJuIHRoaXMuX3NvcnRGdW5jdGlvbjtcbiAgICB9XG5cbiAgICAvLyBJZiB3ZSdyZSBvbmx5IHNvcnRpbmcgb24gZ2VvcXVlcnkgZGlzdGFuY2UgYW5kIG5vIHNwZWNzLCBqdXN0IHNheVxuICAgIC8vIGV2ZXJ5dGhpbmcgaXMgZXF1YWwuXG4gICAgaWYgKCF0aGlzLl9zb3J0U3BlY1BhcnRzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIChkb2MxLCBkb2MyKSA9PiAwO1xuICAgIH1cblxuICAgIHJldHVybiAoZG9jMSwgZG9jMikgPT4ge1xuICAgICAgY29uc3Qga2V5MSA9IHRoaXMuX2dldE1pbktleUZyb21Eb2MoZG9jMSk7XG4gICAgICBjb25zdCBrZXkyID0gdGhpcy5fZ2V0TWluS2V5RnJvbURvYyhkb2MyKTtcbiAgICAgIHJldHVybiB0aGlzLl9jb21wYXJlS2V5cyhrZXkxLCBrZXkyKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gRmluZHMgdGhlIG1pbmltdW0ga2V5IGZyb20gdGhlIGRvYywgYWNjb3JkaW5nIHRvIHRoZSBzb3J0IHNwZWNzLiAgKFdlIHNheVxuICAvLyBcIm1pbmltdW1cIiBoZXJlIGJ1dCB0aGlzIGlzIHdpdGggcmVzcGVjdCB0byB0aGUgc29ydCBzcGVjLCBzbyBcImRlc2NlbmRpbmdcIlxuICAvLyBzb3J0IGZpZWxkcyBtZWFuIHdlJ3JlIGZpbmRpbmcgdGhlIG1heCBmb3IgdGhhdCBmaWVsZC4pXG4gIC8vXG4gIC8vIE5vdGUgdGhhdCB0aGlzIGlzIE5PVCBcImZpbmQgdGhlIG1pbmltdW0gdmFsdWUgb2YgdGhlIGZpcnN0IGZpZWxkLCB0aGVcbiAgLy8gbWluaW11bSB2YWx1ZSBvZiB0aGUgc2Vjb25kIGZpZWxkLCBldGNcIi4uLiBpdCdzIFwiY2hvb3NlIHRoZVxuICAvLyBsZXhpY29ncmFwaGljYWxseSBtaW5pbXVtIHZhbHVlIG9mIHRoZSBrZXkgdmVjdG9yLCBhbGxvd2luZyBvbmx5IGtleXMgd2hpY2hcbiAgLy8geW91IGNhbiBmaW5kIGFsb25nIHRoZSBzYW1lIHBhdGhzXCIuICBpZSwgZm9yIGEgZG9jIHthOiBbe3g6IDAsIHk6IDV9LCB7eDpcbiAgLy8gMSwgeTogM31dfSB3aXRoIHNvcnQgc3BlYyB7J2EueCc6IDEsICdhLnknOiAxfSwgdGhlIG9ubHkga2V5cyBhcmUgWzAsNV0gYW5kXG4gIC8vIFsxLDNdLCBhbmQgdGhlIG1pbmltdW0ga2V5IGlzIFswLDVdOyBub3RhYmx5LCBbMCwzXSBpcyBOT1QgYSBrZXkuXG4gIF9nZXRNaW5LZXlGcm9tRG9jKGRvYykge1xuICAgIGxldCBtaW5LZXkgPSBudWxsO1xuXG4gICAgdGhpcy5fZ2VuZXJhdGVLZXlzRnJvbURvYyhkb2MsIGtleSA9PiB7XG4gICAgICBpZiAobWluS2V5ID09PSBudWxsKSB7XG4gICAgICAgIG1pbktleSA9IGtleTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fY29tcGFyZUtleXMoa2V5LCBtaW5LZXkpIDwgMCkge1xuICAgICAgICBtaW5LZXkgPSBrZXk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gbWluS2V5O1xuICB9XG5cbiAgX2dldFBhdGhzKCkge1xuICAgIHJldHVybiB0aGlzLl9zb3J0U3BlY1BhcnRzLm1hcChwYXJ0ID0+IHBhcnQucGF0aCk7XG4gIH1cblxuICAvLyBHaXZlbiBhbiBpbmRleCAnaScsIHJldHVybnMgYSBjb21wYXJhdG9yIHRoYXQgY29tcGFyZXMgdHdvIGtleSBhcnJheXMgYmFzZWRcbiAgLy8gb24gZmllbGQgJ2knLlxuICBfa2V5RmllbGRDb21wYXJhdG9yKGkpIHtcbiAgICBjb25zdCBpbnZlcnQgPSAhdGhpcy5fc29ydFNwZWNQYXJ0c1tpXS5hc2NlbmRpbmc7XG5cbiAgICByZXR1cm4gKGtleTEsIGtleTIpID0+IHtcbiAgICAgIGNvbnN0IGNvbXBhcmUgPSBMb2NhbENvbGxlY3Rpb24uX2YuX2NtcChrZXkxW2ldLCBrZXkyW2ldKTtcbiAgICAgIHJldHVybiBpbnZlcnQgPyAtY29tcGFyZSA6IGNvbXBhcmU7XG4gICAgfTtcbiAgfVxufVxuXG4vLyBHaXZlbiBhbiBhcnJheSBvZiBjb21wYXJhdG9yc1xuLy8gKGZ1bmN0aW9ucyAoYSxiKS0+KG5lZ2F0aXZlIG9yIHBvc2l0aXZlIG9yIHplcm8pKSwgcmV0dXJucyBhIHNpbmdsZVxuLy8gY29tcGFyYXRvciB3aGljaCB1c2VzIGVhY2ggY29tcGFyYXRvciBpbiBvcmRlciBhbmQgcmV0dXJucyB0aGUgZmlyc3Rcbi8vIG5vbi16ZXJvIHZhbHVlLlxuZnVuY3Rpb24gY29tcG9zZUNvbXBhcmF0b3JzKGNvbXBhcmF0b3JBcnJheSkge1xuICByZXR1cm4gKGEsIGIpID0+IHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbXBhcmF0b3JBcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgY29uc3QgY29tcGFyZSA9IGNvbXBhcmF0b3JBcnJheVtpXShhLCBiKTtcbiAgICAgIGlmIChjb21wYXJlICE9PSAwKSB7XG4gICAgICAgIHJldHVybiBjb21wYXJlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiAwO1xuICB9O1xufVxuIl19
