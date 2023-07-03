(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var NpmModuleMongodb = Package['npm-mongo'].NpmModuleMongodb;
var NpmModuleMongodbVersion = Package['npm-mongo'].NpmModuleMongodbVersion;
var AllowDeny = Package['allow-deny'].AllowDeny;
var Random = Package.random.Random;
var EJSON = Package.ejson.EJSON;
var LocalCollection = Package.minimongo.LocalCollection;
var Minimongo = Package.minimongo.Minimongo;
var DDP = Package['ddp-client'].DDP;
var DDPServer = Package['ddp-server'].DDPServer;
var Tracker = Package.tracker.Tracker;
var Deps = Package.tracker.Deps;
var DiffSequence = Package['diff-sequence'].DiffSequence;
var MongoID = Package['mongo-id'].MongoID;
var check = Package.check.check;
var Match = Package.check.Match;
var ECMAScript = Package.ecmascript.ECMAScript;
var Log = Package.logging.Log;
var Decimal = Package['mongo-decimal'].Decimal;
var _ = Package.underscore._;
var MaxHeap = Package['binary-heap'].MaxHeap;
var MinHeap = Package['binary-heap'].MinHeap;
var MinMaxHeap = Package['binary-heap'].MinMaxHeap;
var Hook = Package['callback-hook'].Hook;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var MongoInternals, MongoConnection, CursorDescription, Cursor, listenAll, forEachTrigger, OPLOG_COLLECTION, idForOp, OplogHandle, ObserveMultiplexer, ObserveHandle, PollingObserveDriver, OplogObserveDriver, Mongo, _ref, field, value, selector, callback, options;

var require = meteorInstall({"node_modules":{"meteor":{"mongo":{"mongo_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/mongo_driver.js                                                                                      //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!function (module1) {
  let _objectSpread;
  module1.link("@babel/runtime/helpers/objectSpread2", {
    default(v) {
      _objectSpread = v;
    }
  }, 0);
  let normalizeProjection;
  module1.link("./mongo_utils", {
    normalizeProjection(v) {
      normalizeProjection = v;
    }
  }, 0);
  let DocFetcher;
  module1.link("./doc_fetcher.js", {
    DocFetcher(v) {
      DocFetcher = v;
    }
  }, 1);
  let ASYNC_CURSOR_METHODS, getAsyncMethodName;
  module1.link("meteor/minimongo/constants", {
    ASYNC_CURSOR_METHODS(v) {
      ASYNC_CURSOR_METHODS = v;
    },
    getAsyncMethodName(v) {
      getAsyncMethodName = v;
    }
  }, 2);
  /**
   * Provide a synchronous Collection API using fibers, backed by
   * MongoDB.  This is only for use on the server, and mostly identical
   * to the client API.
   *
   * NOTE: the public API methods must be run within a fiber. If you call
   * these outside of a fiber they will explode!
   */

  const path = require("path");
  const util = require("util");

  /** @type {import('mongodb')} */
  var MongoDB = NpmModuleMongodb;
  var Future = Npm.require('fibers/future');
  MongoInternals = {};
  MongoInternals.NpmModules = {
    mongodb: {
      version: NpmModuleMongodbVersion,
      module: MongoDB
    }
  };

  // Older version of what is now available via
  // MongoInternals.NpmModules.mongodb.module.  It was never documented, but
  // people do use it.
  // XXX COMPAT WITH 1.0.3.2
  MongoInternals.NpmModule = MongoDB;
  const FILE_ASSET_SUFFIX = 'Asset';
  const ASSETS_FOLDER = 'assets';
  const APP_FOLDER = 'app';

  // This is used to add or remove EJSON from the beginning of everything nested
  // inside an EJSON custom type. It should only be called on pure JSON!
  var replaceNames = function (filter, thing) {
    if (typeof thing === "object" && thing !== null) {
      if (_.isArray(thing)) {
        return _.map(thing, _.bind(replaceNames, null, filter));
      }
      var ret = {};
      _.each(thing, function (value, key) {
        ret[filter(key)] = replaceNames(filter, value);
      });
      return ret;
    }
    return thing;
  };

  // Ensure that EJSON.clone keeps a Timestamp as a Timestamp (instead of just
  // doing a structural clone).
  // XXX how ok is this? what if there are multiple copies of MongoDB loaded?
  MongoDB.Timestamp.prototype.clone = function () {
    // Timestamps should be immutable.
    return this;
  };
  var makeMongoLegal = function (name) {
    return "EJSON" + name;
  };
  var unmakeMongoLegal = function (name) {
    return name.substr(5);
  };
  var replaceMongoAtomWithMeteor = function (document) {
    if (document instanceof MongoDB.Binary) {
      // for backwards compatibility
      if (document.sub_type !== 0) {
        return document;
      }
      var buffer = document.value(true);
      return new Uint8Array(buffer);
    }
    if (document instanceof MongoDB.ObjectID) {
      return new Mongo.ObjectID(document.toHexString());
    }
    if (document instanceof MongoDB.Decimal128) {
      return Decimal(document.toString());
    }
    if (document["EJSON$type"] && document["EJSON$value"] && _.size(document) === 2) {
      return EJSON.fromJSONValue(replaceNames(unmakeMongoLegal, document));
    }
    if (document instanceof MongoDB.Timestamp) {
      // For now, the Meteor representation of a Mongo timestamp type (not a date!
      // this is a weird internal thing used in the oplog!) is the same as the
      // Mongo representation. We need to do this explicitly or else we would do a
      // structural clone and lose the prototype.
      return document;
    }
    return undefined;
  };
  var replaceMeteorAtomWithMongo = function (document) {
    if (EJSON.isBinary(document)) {
      // This does more copies than we'd like, but is necessary because
      // MongoDB.BSON only looks like it takes a Uint8Array (and doesn't actually
      // serialize it correctly).
      return new MongoDB.Binary(Buffer.from(document));
    }
    if (document instanceof MongoDB.Binary) {
      return document;
    }
    if (document instanceof Mongo.ObjectID) {
      return new MongoDB.ObjectID(document.toHexString());
    }
    if (document instanceof MongoDB.Timestamp) {
      // For now, the Meteor representation of a Mongo timestamp type (not a date!
      // this is a weird internal thing used in the oplog!) is the same as the
      // Mongo representation. We need to do this explicitly or else we would do a
      // structural clone and lose the prototype.
      return document;
    }
    if (document instanceof Decimal) {
      return MongoDB.Decimal128.fromString(document.toString());
    }
    if (EJSON._isCustomType(document)) {
      return replaceNames(makeMongoLegal, EJSON.toJSONValue(document));
    }
    // It is not ordinarily possible to stick dollar-sign keys into mongo
    // so we don't bother checking for things that need escaping at this time.
    return undefined;
  };
  var replaceTypes = function (document, atomTransformer) {
    if (typeof document !== 'object' || document === null) return document;
    var replacedTopLevelAtom = atomTransformer(document);
    if (replacedTopLevelAtom !== undefined) return replacedTopLevelAtom;
    var ret = document;
    _.each(document, function (val, key) {
      var valReplaced = replaceTypes(val, atomTransformer);
      if (val !== valReplaced) {
        // Lazy clone. Shallow copy.
        if (ret === document) ret = _.clone(document);
        ret[key] = valReplaced;
      }
    });
    return ret;
  };
  MongoConnection = function (url, options) {
    var _Meteor$settings, _Meteor$settings$pack, _Meteor$settings$pack2;
    var self = this;
    options = options || {};
    self._observeMultiplexers = {};
    self._onFailoverHook = new Hook();
    const userOptions = _objectSpread(_objectSpread({}, Mongo._connectionOptions || {}), ((_Meteor$settings = Meteor.settings) === null || _Meteor$settings === void 0 ? void 0 : (_Meteor$settings$pack = _Meteor$settings.packages) === null || _Meteor$settings$pack === void 0 ? void 0 : (_Meteor$settings$pack2 = _Meteor$settings$pack.mongo) === null || _Meteor$settings$pack2 === void 0 ? void 0 : _Meteor$settings$pack2.options) || {});
    var mongoOptions = Object.assign({
      ignoreUndefined: true
    }, userOptions);

    // Internally the oplog connections specify their own maxPoolSize
    // which we don't want to overwrite with any user defined value
    if (_.has(options, 'maxPoolSize')) {
      // If we just set this for "server", replSet will override it. If we just
      // set it for replSet, it will be ignored if we're not using a replSet.
      mongoOptions.maxPoolSize = options.maxPoolSize;
    }

    // Transform options like "tlsCAFileAsset": "filename.pem" into
    // "tlsCAFile": "/<fullpath>/filename.pem"
    Object.entries(mongoOptions || {}).filter(_ref => {
      let [key] = _ref;
      return key && key.endsWith(FILE_ASSET_SUFFIX);
    }).forEach(_ref2 => {
      let [key, value] = _ref2;
      const optionName = key.replace(FILE_ASSET_SUFFIX, '');
      mongoOptions[optionName] = path.join(Assets.getServerDir(), ASSETS_FOLDER, APP_FOLDER, value);
      delete mongoOptions[key];
    });
    self.db = null;
    self._oplogHandle = null;
    self._docFetcher = null;
    self.client = new MongoDB.MongoClient(url, mongoOptions);
    self.db = self.client.db();
    self.client.on('serverDescriptionChanged', Meteor.bindEnvironment(event => {
      // When the connection is no longer against the primary node, execute all
      // failover hooks. This is important for the driver as it has to re-pool the
      // query when it happens.
      if (event.previousDescription.type !== 'RSPrimary' && event.newDescription.type === 'RSPrimary') {
        self._onFailoverHook.each(callback => {
          callback();
          return true;
        });
      }
    }));
    if (options.oplogUrl && !Package['disable-oplog']) {
      self._oplogHandle = new OplogHandle(options.oplogUrl, self.db.databaseName);
      self._docFetcher = new DocFetcher(self);
    }
  };
  MongoConnection.prototype.close = function () {
    var self = this;
    if (!self.db) throw Error("close called before Connection created?");

    // XXX probably untested
    var oplogHandle = self._oplogHandle;
    self._oplogHandle = null;
    if (oplogHandle) oplogHandle.stop();

    // Use Future.wrap so that errors get thrown. This happens to
    // work even outside a fiber since the 'close' method is not
    // actually asynchronous.
    Future.wrap(_.bind(self.client.close, self.client))(true).wait();
  };

  // Returns the Mongo Collection object; may yield.
  MongoConnection.prototype.rawCollection = function (collectionName) {
    var self = this;
    if (!self.db) throw Error("rawCollection called before Connection created?");
    return self.db.collection(collectionName);
  };
  MongoConnection.prototype._createCappedCollection = function (collectionName, byteSize, maxDocuments) {
    var self = this;
    if (!self.db) throw Error("_createCappedCollection called before Connection created?");
    var future = new Future();
    self.db.createCollection(collectionName, {
      capped: true,
      size: byteSize,
      max: maxDocuments
    }, future.resolver());
    future.wait();
  };

  // This should be called synchronously with a write, to create a
  // transaction on the current write fence, if any. After we can read
  // the write, and after observers have been notified (or at least,
  // after the observer notifiers have added themselves to the write
  // fence), you should call 'committed()' on the object returned.
  MongoConnection.prototype._maybeBeginWrite = function () {
    var fence = DDPServer._CurrentWriteFence.get();
    if (fence) {
      return fence.beginWrite();
    } else {
      return {
        committed: function () {}
      };
    }
  };

  // Internal interface: adds a callback which is called when the Mongo primary
  // changes. Returns a stop handle.
  MongoConnection.prototype._onFailover = function (callback) {
    return this._onFailoverHook.register(callback);
  };

  //////////// Public API //////////

  // The write methods block until the database has confirmed the write (it may
  // not be replicated or stable on disk, but one server has confirmed it) if no
  // callback is provided. If a callback is provided, then they call the callback
  // when the write is confirmed. They return nothing on success, and raise an
  // exception on failure.
  //
  // After making a write (with insert, update, remove), observers are
  // notified asynchronously. If you want to receive a callback once all
  // of the observer notifications have landed for your write, do the
  // writes inside a write fence (set DDPServer._CurrentWriteFence to a new
  // _WriteFence, and then set a callback on the write fence.)
  //
  // Since our execution environment is single-threaded, this is
  // well-defined -- a write "has been made" if it's returned, and an
  // observer "has been notified" if its callback has returned.

  var writeCallback = function (write, refresh, callback) {
    return function (err, result) {
      if (!err) {
        // XXX We don't have to run this on error, right?
        try {
          refresh();
        } catch (refreshErr) {
          if (callback) {
            callback(refreshErr);
            return;
          } else {
            throw refreshErr;
          }
        }
      }
      write.committed();
      if (callback) {
        callback(err, result);
      } else if (err) {
        throw err;
      }
    };
  };
  var bindEnvironmentForWrite = function (callback) {
    return Meteor.bindEnvironment(callback, "Mongo write");
  };
  MongoConnection.prototype._insert = function (collection_name, document, callback) {
    var self = this;
    var sendError = function (e) {
      if (callback) return callback(e);
      throw e;
    };
    if (collection_name === "___meteor_failure_test_collection") {
      var e = new Error("Failure test");
      e._expectedByTest = true;
      sendError(e);
      return;
    }
    if (!(LocalCollection._isPlainObject(document) && !EJSON._isCustomType(document))) {
      sendError(new Error("Only plain objects may be inserted into MongoDB"));
      return;
    }
    var write = self._maybeBeginWrite();
    var refresh = function () {
      Meteor.refresh({
        collection: collection_name,
        id: document._id
      });
    };
    callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));
    try {
      var collection = self.rawCollection(collection_name);
      collection.insertOne(replaceTypes(document, replaceMeteorAtomWithMongo), {
        safe: true
      }).then(_ref3 => {
        let {
          insertedId
        } = _ref3;
        callback(null, insertedId);
      }).catch(e => {
        callback(e, null);
      });
    } catch (err) {
      write.committed();
      throw err;
    }
  };

  // Cause queries that may be affected by the selector to poll in this write
  // fence.
  MongoConnection.prototype._refresh = function (collectionName, selector) {
    var refreshKey = {
      collection: collectionName
    };
    // If we know which documents we're removing, don't poll queries that are
    // specific to other documents. (Note that multiple notifications here should
    // not cause multiple polls, since all our listener is doing is enqueueing a
    // poll.)
    var specificIds = LocalCollection._idsMatchedBySelector(selector);
    if (specificIds) {
      _.each(specificIds, function (id) {
        Meteor.refresh(_.extend({
          id: id
        }, refreshKey));
      });
    } else {
      Meteor.refresh(refreshKey);
    }
  };
  MongoConnection.prototype._remove = function (collection_name, selector, callback) {
    var self = this;
    if (collection_name === "___meteor_failure_test_collection") {
      var e = new Error("Failure test");
      e._expectedByTest = true;
      if (callback) {
        return callback(e);
      } else {
        throw e;
      }
    }
    var write = self._maybeBeginWrite();
    var refresh = function () {
      self._refresh(collection_name, selector);
    };
    callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));
    try {
      var collection = self.rawCollection(collection_name);
      collection.deleteMany(replaceTypes(selector, replaceMeteorAtomWithMongo), {
        safe: true
      }).then(_ref4 => {
        let {
          deletedCount
        } = _ref4;
        callback(null, transformResult({
          result: {
            modifiedCount: deletedCount
          }
        }).numberAffected);
      }).catch(err => {
        callback(err);
      });
    } catch (err) {
      write.committed();
      throw err;
    }
  };
  MongoConnection.prototype._dropCollection = function (collectionName, cb) {
    var self = this;
    var write = self._maybeBeginWrite();
    var refresh = function () {
      Meteor.refresh({
        collection: collectionName,
        id: null,
        dropCollection: true
      });
    };
    cb = bindEnvironmentForWrite(writeCallback(write, refresh, cb));
    try {
      var collection = self.rawCollection(collectionName);
      collection.drop(cb);
    } catch (e) {
      write.committed();
      throw e;
    }
  };

  // For testing only.  Slightly better than `c.rawDatabase().dropDatabase()`
  // because it lets the test's fence wait for it to be complete.
  MongoConnection.prototype._dropDatabase = function (cb) {
    var self = this;
    var write = self._maybeBeginWrite();
    var refresh = function () {
      Meteor.refresh({
        dropDatabase: true
      });
    };
    cb = bindEnvironmentForWrite(writeCallback(write, refresh, cb));
    try {
      self.db.dropDatabase(cb);
    } catch (e) {
      write.committed();
      throw e;
    }
  };
  MongoConnection.prototype._update = function (collection_name, selector, mod, options, callback) {
    var self = this;
    if (!callback && options instanceof Function) {
      callback = options;
      options = null;
    }
    if (collection_name === "___meteor_failure_test_collection") {
      var e = new Error("Failure test");
      e._expectedByTest = true;
      if (callback) {
        return callback(e);
      } else {
        throw e;
      }
    }

    // explicit safety check. null and undefined can crash the mongo
    // driver. Although the node driver and minimongo do 'support'
    // non-object modifier in that they don't crash, they are not
    // meaningful operations and do not do anything. Defensively throw an
    // error here.
    if (!mod || typeof mod !== 'object') throw new Error("Invalid modifier. Modifier must be an object.");
    if (!(LocalCollection._isPlainObject(mod) && !EJSON._isCustomType(mod))) {
      throw new Error("Only plain objects may be used as replacement" + " documents in MongoDB");
    }
    if (!options) options = {};
    var write = self._maybeBeginWrite();
    var refresh = function () {
      self._refresh(collection_name, selector);
    };
    callback = writeCallback(write, refresh, callback);
    try {
      var collection = self.rawCollection(collection_name);
      var mongoOpts = {
        safe: true
      };
      // Add support for filtered positional operator
      if (options.arrayFilters !== undefined) mongoOpts.arrayFilters = options.arrayFilters;
      // explictly enumerate options that minimongo supports
      if (options.upsert) mongoOpts.upsert = true;
      if (options.multi) mongoOpts.multi = true;
      // Lets you get a more more full result from MongoDB. Use with caution:
      // might not work with C.upsert (as opposed to C.update({upsert:true}) or
      // with simulated upsert.
      if (options.fullResult) mongoOpts.fullResult = true;
      var mongoSelector = replaceTypes(selector, replaceMeteorAtomWithMongo);
      var mongoMod = replaceTypes(mod, replaceMeteorAtomWithMongo);
      var isModify = LocalCollection._isModificationMod(mongoMod);
      if (options._forbidReplace && !isModify) {
        var err = new Error("Invalid modifier. Replacements are forbidden.");
        if (callback) {
          return callback(err);
        } else {
          throw err;
        }
      }

      // We've already run replaceTypes/replaceMeteorAtomWithMongo on
      // selector and mod.  We assume it doesn't matter, as far as
      // the behavior of modifiers is concerned, whether `_modify`
      // is run on EJSON or on mongo-converted EJSON.

      // Run this code up front so that it fails fast if someone uses
      // a Mongo update operator we don't support.
      let knownId;
      if (options.upsert) {
        try {
          let newDoc = LocalCollection._createUpsertDocument(selector, mod);
          knownId = newDoc._id;
        } catch (err) {
          if (callback) {
            return callback(err);
          } else {
            throw err;
          }
        }
      }
      if (options.upsert && !isModify && !knownId && options.insertedId && !(options.insertedId instanceof Mongo.ObjectID && options.generatedId)) {
        // In case of an upsert with a replacement, where there is no _id defined
        // in either the query or the replacement doc, mongo will generate an id itself.
        // Therefore we need this special strategy if we want to control the id ourselves.

        // We don't need to do this when:
        // - This is not a replacement, so we can add an _id to $setOnInsert
        // - The id is defined by query or mod we can just add it to the replacement doc
        // - The user did not specify any id preference and the id is a Mongo ObjectId,
        //     then we can just let Mongo generate the id

        simulateUpsertWithInsertedId(collection, mongoSelector, mongoMod, options,
        // This callback does not need to be bindEnvironment'ed because
        // simulateUpsertWithInsertedId() wraps it and then passes it through
        // bindEnvironmentForWrite.
        function (error, result) {
          // If we got here via a upsert() call, then options._returnObject will
          // be set and we should return the whole object. Otherwise, we should
          // just return the number of affected docs to match the mongo API.
          if (result && !options._returnObject) {
            callback(error, result.numberAffected);
          } else {
            callback(error, result);
          }
        });
      } else {
        if (options.upsert && !knownId && options.insertedId && isModify) {
          if (!mongoMod.hasOwnProperty('$setOnInsert')) {
            mongoMod.$setOnInsert = {};
          }
          knownId = options.insertedId;
          Object.assign(mongoMod.$setOnInsert, replaceTypes({
            _id: options.insertedId
          }, replaceMeteorAtomWithMongo));
        }
        const strings = Object.keys(mongoMod).filter(key => !key.startsWith("$"));
        let updateMethod = strings.length > 0 ? 'replaceOne' : 'updateMany';
        updateMethod = updateMethod === 'updateMany' && !mongoOpts.multi ? 'updateOne' : updateMethod;
        collection[updateMethod].bind(collection)(mongoSelector, mongoMod, mongoOpts,
        // mongo driver now returns undefined for err in the callback
        bindEnvironmentForWrite(function () {
          let err = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
          let result = arguments.length > 1 ? arguments[1] : undefined;
          if (!err) {
            var meteorResult = transformResult({
              result
            });
            if (meteorResult && options._returnObject) {
              // If this was an upsert() call, and we ended up
              // inserting a new doc and we know its id, then
              // return that id as well.
              if (options.upsert && meteorResult.insertedId) {
                if (knownId) {
                  meteorResult.insertedId = knownId;
                } else if (meteorResult.insertedId instanceof MongoDB.ObjectID) {
                  meteorResult.insertedId = new Mongo.ObjectID(meteorResult.insertedId.toHexString());
                }
              }
              callback(err, meteorResult);
            } else {
              callback(err, meteorResult.numberAffected);
            }
          } else {
            callback(err);
          }
        }));
      }
    } catch (e) {
      write.committed();
      throw e;
    }
  };
  var transformResult = function (driverResult) {
    var meteorResult = {
      numberAffected: 0
    };
    if (driverResult) {
      var mongoResult = driverResult.result;
      // On updates with upsert:true, the inserted values come as a list of
      // upserted values -- even with options.multi, when the upsert does insert,
      // it only inserts one element.
      if (mongoResult.upsertedCount) {
        meteorResult.numberAffected = mongoResult.upsertedCount;
        if (mongoResult.upsertedId) {
          meteorResult.insertedId = mongoResult.upsertedId;
        }
      } else {
        // n was used before Mongo 5.0, in Mongo 5.0 we are not receiving this n
        // field and so we are using modifiedCount instead
        meteorResult.numberAffected = mongoResult.n || mongoResult.matchedCount || mongoResult.modifiedCount;
      }
    }
    return meteorResult;
  };
  var NUM_OPTIMISTIC_TRIES = 3;

  // exposed for testing
  MongoConnection._isCannotChangeIdError = function (err) {
    // Mongo 3.2.* returns error as next Object:
    // {name: String, code: Number, errmsg: String}
    // Older Mongo returns:
    // {name: String, code: Number, err: String}
    var error = err.errmsg || err.err;

    // We don't use the error code here
    // because the error code we observed it producing (16837) appears to be
    // a far more generic error code based on examining the source.
    if (error.indexOf('The _id field cannot be changed') === 0 || error.indexOf("the (immutable) field '_id' was found to have been altered to _id") !== -1) {
      return true;
    }
    return false;
  };
  var simulateUpsertWithInsertedId = function (collection, selector, mod, options, callback) {
    // STRATEGY: First try doing an upsert with a generated ID.
    // If this throws an error about changing the ID on an existing document
    // then without affecting the database, we know we should probably try
    // an update without the generated ID. If it affected 0 documents,
    // then without affecting the database, we the document that first
    // gave the error is probably removed and we need to try an insert again
    // We go back to step one and repeat.
    // Like all "optimistic write" schemes, we rely on the fact that it's
    // unlikely our writes will continue to be interfered with under normal
    // circumstances (though sufficiently heavy contention with writers
    // disagreeing on the existence of an object will cause writes to fail
    // in theory).

    var insertedId = options.insertedId; // must exist
    var mongoOptsForUpdate = {
      safe: true,
      multi: options.multi
    };
    var mongoOptsForInsert = {
      safe: true,
      upsert: true
    };
    var replacementWithId = Object.assign(replaceTypes({
      _id: insertedId
    }, replaceMeteorAtomWithMongo), mod);
    var tries = NUM_OPTIMISTIC_TRIES;
    var doUpdate = function () {
      tries--;
      if (!tries) {
        callback(new Error("Upsert failed after " + NUM_OPTIMISTIC_TRIES + " tries."));
      } else {
        let method = collection.updateMany;
        if (!Object.keys(mod).some(key => key.startsWith("$"))) {
          method = collection.replaceOne.bind(collection);
        }
        method(selector, mod, mongoOptsForUpdate, bindEnvironmentForWrite(function (err, result) {
          if (err) {
            callback(err);
          } else if (result && (result.modifiedCount || result.upsertedCount)) {
            callback(null, {
              numberAffected: result.modifiedCount || result.upsertedCount,
              insertedId: result.upsertedId || undefined
            });
          } else {
            doConditionalInsert();
          }
        }));
      }
    };
    var doConditionalInsert = function () {
      collection.replaceOne(selector, replacementWithId, mongoOptsForInsert, bindEnvironmentForWrite(function (err, result) {
        if (err) {
          // figure out if this is a
          // "cannot change _id of document" error, and
          // if so, try doUpdate() again, up to 3 times.
          if (MongoConnection._isCannotChangeIdError(err)) {
            doUpdate();
          } else {
            callback(err);
          }
        } else {
          callback(null, {
            numberAffected: result.upsertedCount,
            insertedId: result.upsertedId
          });
        }
      }));
    };
    doUpdate();
  };
  _.each(["insert", "update", "remove", "dropCollection", "dropDatabase"], function (method) {
    MongoConnection.prototype[method] = function /* arguments */
    () {
      var self = this;
      return Meteor.wrapAsync(self["_" + method]).apply(self, arguments);
    };
  });

  // XXX MongoConnection.upsert() does not return the id of the inserted document
  // unless you set it explicitly in the selector or modifier (as a replacement
  // doc).
  MongoConnection.prototype.upsert = function (collectionName, selector, mod, options, callback) {
    var self = this;
    if (typeof options === "function" && !callback) {
      callback = options;
      options = {};
    }
    return self.update(collectionName, selector, mod, _.extend({}, options, {
      upsert: true,
      _returnObject: true
    }), callback);
  };
  MongoConnection.prototype.find = function (collectionName, selector, options) {
    var self = this;
    if (arguments.length === 1) selector = {};
    return new Cursor(self, new CursorDescription(collectionName, selector, options));
  };
  MongoConnection.prototype.findOneAsync = function (collection_name, selector, options) {
    return Promise.asyncApply(() => {
      var self = this;
      if (arguments.length === 1) selector = {};
      options = options || {};
      options.limit = 1;
      return Promise.await(self.find(collection_name, selector, options).fetchAsync())[0];
    });
  };
  MongoConnection.prototype.findOne = function (collection_name, selector, options) {
    var self = this;
    return Future.fromPromise(self.findOneAsync(collection_name, selector, options)).wait();
  };
  MongoConnection.prototype.createIndexAsync = function (collectionName, index, options) {
    var self = this;

    // We expect this function to be called at startup, not from within a method,
    // so we don't interact with the write fence.
    var collection = self.rawCollection(collectionName);
    return collection.createIndex(index, options);
  };

  // We'll actually design an index API later. For now, we just pass through to
  // Mongo's, but make it synchronous.
  MongoConnection.prototype.createIndex = function (collectionName, index, options) {
    var self = this;
    return Future.fromPromise(self.createIndexAsync(collectionName, index, options));
  };
  MongoConnection.prototype.countDocuments = function (collectionName) {
    for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      args[_key - 1] = arguments[_key];
    }
    args = args.map(arg => replaceTypes(arg, replaceMeteorAtomWithMongo));
    const collection = this.rawCollection(collectionName);
    return collection.countDocuments(...args);
  };
  MongoConnection.prototype.estimatedDocumentCount = function (collectionName) {
    for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }
    args = args.map(arg => replaceTypes(arg, replaceMeteorAtomWithMongo));
    const collection = this.rawCollection(collectionName);
    return collection.estimatedDocumentCount(...args);
  };
  MongoConnection.prototype._ensureIndex = MongoConnection.prototype.createIndex;
  MongoConnection.prototype._dropIndex = function (collectionName, index) {
    var self = this;

    // This function is only used by test code, not within a method, so we don't
    // interact with the write fence.
    var collection = self.rawCollection(collectionName);
    var future = new Future();
    var indexName = collection.dropIndex(index, future.resolver());
    future.wait();
  };

  // CURSORS

  // There are several classes which relate to cursors:
  //
  // CursorDescription represents the arguments used to construct a cursor:
  // collectionName, selector, and (find) options.  Because it is used as a key
  // for cursor de-dup, everything in it should either be JSON-stringifiable or
  // not affect observeChanges output (eg, options.transform functions are not
  // stringifiable but do not affect observeChanges).
  //
  // SynchronousCursor is a wrapper around a MongoDB cursor
  // which includes fully-synchronous versions of forEach, etc.
  //
  // Cursor is the cursor object returned from find(), which implements the
  // documented Mongo.Collection cursor API.  It wraps a CursorDescription and a
  // SynchronousCursor (lazily: it doesn't contact Mongo until you call a method
  // like fetch or forEach on it).
  //
  // ObserveHandle is the "observe handle" returned from observeChanges. It has a
  // reference to an ObserveMultiplexer.
  //
  // ObserveMultiplexer allows multiple identical ObserveHandles to be driven by a
  // single observe driver.
  //
  // There are two "observe drivers" which drive ObserveMultiplexers:
  //   - PollingObserveDriver caches the results of a query and reruns it when
  //     necessary.
  //   - OplogObserveDriver follows the Mongo operation log to directly observe
  //     database changes.
  // Both implementations follow the same simple interface: when you create them,
  // they start sending observeChanges callbacks (and a ready() invocation) to
  // their ObserveMultiplexer, and you stop them by calling their stop() method.

  CursorDescription = function (collectionName, selector, options) {
    var self = this;
    self.collectionName = collectionName;
    self.selector = Mongo.Collection._rewriteSelector(selector);
    self.options = options || {};
  };
  Cursor = function (mongo, cursorDescription) {
    var self = this;
    self._mongo = mongo;
    self._cursorDescription = cursorDescription;
    self._synchronousCursor = null;
  };
  function setupSynchronousCursor(cursor, method) {
    // You can only observe a tailable cursor.
    if (cursor._cursorDescription.options.tailable) throw new Error('Cannot call ' + method + ' on a tailable cursor');
    if (!cursor._synchronousCursor) {
      cursor._synchronousCursor = cursor._mongo._createSynchronousCursor(cursor._cursorDescription, {
        // Make sure that the "cursor" argument to forEach/map callbacks is the
        // Cursor, not the SynchronousCursor.
        selfForIteration: cursor,
        useTransform: true
      });
    }
    return cursor._synchronousCursor;
  }
  Cursor.prototype.count = function () {
    const collection = this._mongo.rawCollection(this._cursorDescription.collectionName);
    return Promise.await(collection.countDocuments(replaceTypes(this._cursorDescription.selector, replaceMeteorAtomWithMongo), replaceTypes(this._cursorDescription.options, replaceMeteorAtomWithMongo)));
  };
  [...ASYNC_CURSOR_METHODS, Symbol.iterator, Symbol.asyncIterator].forEach(methodName => {
    // count is handled specially since we don't want to create a cursor.
    // it is still included in ASYNC_CURSOR_METHODS because we still want an async version of it to exist.
    if (methodName !== 'count') {
      Cursor.prototype[methodName] = function () {
        const cursor = setupSynchronousCursor(this, methodName);
        return cursor[methodName](...arguments);
      };
    }

    // These methods are handled separately.
    if (methodName === Symbol.iterator || methodName === Symbol.asyncIterator) {
      return;
    }
    const methodNameAsync = getAsyncMethodName(methodName);
    Cursor.prototype[methodNameAsync] = function () {
      try {
        this[methodName].isCalledFromAsync = true;
        return Promise.resolve(this[methodName](...arguments));
      } catch (error) {
        return Promise.reject(error);
      }
    };
  });
  Cursor.prototype.getTransform = function () {
    return this._cursorDescription.options.transform;
  };

  // When you call Meteor.publish() with a function that returns a Cursor, we need
  // to transmute it into the equivalent subscription.  This is the function that
  // does that.

  Cursor.prototype._publishCursor = function (sub) {
    var self = this;
    var collection = self._cursorDescription.collectionName;
    return Mongo.Collection._publishCursor(self, sub, collection);
  };

  // Used to guarantee that publish functions return at most one cursor per
  // collection. Private, because we might later have cursors that include
  // documents from multiple collections somehow.
  Cursor.prototype._getCollectionName = function () {
    var self = this;
    return self._cursorDescription.collectionName;
  };
  Cursor.prototype.observe = function (callbacks) {
    var self = this;
    return LocalCollection._observeFromObserveChanges(self, callbacks);
  };
  Cursor.prototype.observeChanges = function (callbacks) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var self = this;
    var methods = ['addedAt', 'added', 'changedAt', 'changed', 'removedAt', 'removed', 'movedTo'];
    var ordered = LocalCollection._observeChangesCallbacksAreOrdered(callbacks);
    let exceptionName = callbacks._fromObserve ? 'observe' : 'observeChanges';
    exceptionName += ' callback';
    methods.forEach(function (method) {
      if (callbacks[method] && typeof callbacks[method] == "function") {
        callbacks[method] = Meteor.bindEnvironment(callbacks[method], method + exceptionName);
      }
    });
    return self._mongo._observeChanges(self._cursorDescription, ordered, callbacks, options.nonMutatingCallbacks);
  };
  MongoConnection.prototype._createSynchronousCursor = function (cursorDescription, options) {
    var self = this;
    options = _.pick(options || {}, 'selfForIteration', 'useTransform');
    var collection = self.rawCollection(cursorDescription.collectionName);
    var cursorOptions = cursorDescription.options;
    var mongoOptions = {
      sort: cursorOptions.sort,
      limit: cursorOptions.limit,
      skip: cursorOptions.skip,
      projection: cursorOptions.fields || cursorOptions.projection,
      readPreference: cursorOptions.readPreference
    };

    // Do we want a tailable cursor (which only works on capped collections)?
    if (cursorOptions.tailable) {
      mongoOptions.numberOfRetries = -1;
    }
    var dbCursor = collection.find(replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo), mongoOptions);

    // Do we want a tailable cursor (which only works on capped collections)?
    if (cursorOptions.tailable) {
      // We want a tailable cursor...
      dbCursor.addCursorFlag("tailable", true);
      // ... and for the server to wait a bit if any getMore has no data (rather
      // than making us put the relevant sleeps in the client)...
      dbCursor.addCursorFlag("awaitData", true);

      // And if this is on the oplog collection and the cursor specifies a 'ts',
      // then set the undocumented oplog replay flag, which does a special scan to
      // find the first document (instead of creating an index on ts). This is a
      // very hard-coded Mongo flag which only works on the oplog collection and
      // only works with the ts field.
      if (cursorDescription.collectionName === OPLOG_COLLECTION && cursorDescription.selector.ts) {
        dbCursor.addCursorFlag("oplogReplay", true);
      }
    }
    if (typeof cursorOptions.maxTimeMs !== 'undefined') {
      dbCursor = dbCursor.maxTimeMS(cursorOptions.maxTimeMs);
    }
    if (typeof cursorOptions.hint !== 'undefined') {
      dbCursor = dbCursor.hint(cursorOptions.hint);
    }
    return new SynchronousCursor(dbCursor, cursorDescription, options, collection);
  };
  var SynchronousCursor = function (dbCursor, cursorDescription, options, collection) {
    var self = this;
    options = _.pick(options || {}, 'selfForIteration', 'useTransform');
    self._dbCursor = dbCursor;
    self._cursorDescription = cursorDescription;
    // The "self" argument passed to forEach/map callbacks. If we're wrapped
    // inside a user-visible Cursor, we want to provide the outer cursor!
    self._selfForIteration = options.selfForIteration || self;
    if (options.useTransform && cursorDescription.options.transform) {
      self._transform = LocalCollection.wrapTransform(cursorDescription.options.transform);
    } else {
      self._transform = null;
    }
    self._synchronousCount = Future.wrap(collection.countDocuments.bind(collection, replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo), replaceTypes(cursorDescription.options, replaceMeteorAtomWithMongo)));
    self._visitedIds = new LocalCollection._IdMap();
  };
  _.extend(SynchronousCursor.prototype, {
    // Returns a Promise for the next object from the underlying cursor (before
    // the Mongo->Meteor type replacement).
    _rawNextObjectPromise: function () {
      const self = this;
      return new Promise((resolve, reject) => {
        self._dbCursor.next((err, doc) => {
          if (err) {
            reject(err);
          } else {
            resolve(doc);
          }
        });
      });
    },
    // Returns a Promise for the next object from the cursor, skipping those whose
    // IDs we've already seen and replacing Mongo atoms with Meteor atoms.
    _nextObjectPromise: function () {
      return Promise.asyncApply(() => {
        var self = this;
        while (true) {
          var doc = Promise.await(self._rawNextObjectPromise());
          if (!doc) return null;
          doc = replaceTypes(doc, replaceMongoAtomWithMeteor);
          if (!self._cursorDescription.options.tailable && _.has(doc, '_id')) {
            // Did Mongo give us duplicate documents in the same cursor? If so,
            // ignore this one. (Do this before the transform, since transform might
            // return some unrelated value.) We don't do this for tailable cursors,
            // because we want to maintain O(1) memory usage. And if there isn't _id
            // for some reason (maybe it's the oplog), then we don't do this either.
            // (Be careful to do this for falsey but existing _id, though.)
            if (self._visitedIds.has(doc._id)) continue;
            self._visitedIds.set(doc._id, true);
          }
          if (self._transform) doc = self._transform(doc);
          return doc;
        }
      });
    },
    // Returns a promise which is resolved with the next object (like with
    // _nextObjectPromise) or rejected if the cursor doesn't return within
    // timeoutMS ms.
    _nextObjectPromiseWithTimeout: function (timeoutMS) {
      const self = this;
      if (!timeoutMS) {
        return self._nextObjectPromise();
      }
      const nextObjectPromise = self._nextObjectPromise();
      const timeoutErr = new Error('Client-side timeout waiting for next object');
      const timeoutPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(timeoutErr);
        }, timeoutMS);
      });
      return Promise.race([nextObjectPromise, timeoutPromise]).catch(err => {
        if (err === timeoutErr) {
          self.close();
        }
        throw err;
      });
    },
    _nextObject: function () {
      var self = this;
      return self._nextObjectPromise().await();
    },
    forEach: function (callback, thisArg) {
      var self = this;
      const wrappedFn = Meteor.wrapFn(callback);

      // Get back to the beginning.
      self._rewind();

      // We implement the loop ourself instead of using self._dbCursor.each,
      // because "each" will call its callback outside of a fiber which makes it
      // much more complex to make this function synchronous.
      var index = 0;
      while (true) {
        var doc = self._nextObject();
        if (!doc) return;
        wrappedFn.call(thisArg, doc, index++, self._selfForIteration);
      }
    },
    // XXX Allow overlapping callback executions if callback yields.
    map: function (callback, thisArg) {
      var self = this;
      const wrappedFn = Meteor.wrapFn(callback);
      var res = [];
      self.forEach(function (doc, index) {
        res.push(wrappedFn.call(thisArg, doc, index, self._selfForIteration));
      });
      return res;
    },
    _rewind: function () {
      var self = this;

      // known to be synchronous
      self._dbCursor.rewind();
      self._visitedIds = new LocalCollection._IdMap();
    },
    // Mostly usable for tailable cursors.
    close: function () {
      var self = this;
      self._dbCursor.close();
    },
    fetch: function () {
      var self = this;
      return self.map(_.identity);
    },
    count: function () {
      var self = this;
      return self._synchronousCount().wait();
    },
    // This method is NOT wrapped in Cursor.
    getRawObjects: function (ordered) {
      var self = this;
      if (ordered) {
        return self.fetch();
      } else {
        var results = new LocalCollection._IdMap();
        self.forEach(function (doc) {
          results.set(doc._id, doc);
        });
        return results;
      }
    }
  });
  SynchronousCursor.prototype[Symbol.iterator] = function () {
    var self = this;

    // Get back to the beginning.
    self._rewind();
    return {
      next() {
        const doc = self._nextObject();
        return doc ? {
          value: doc
        } : {
          done: true
        };
      }
    };
  };
  SynchronousCursor.prototype[Symbol.asyncIterator] = function () {
    const syncResult = this[Symbol.iterator]();
    return {
      next() {
        return Promise.asyncApply(() => {
          return Promise.resolve(syncResult.next());
        });
      }
    };
  };

  // Tails the cursor described by cursorDescription, most likely on the
  // oplog. Calls docCallback with each document found. Ignores errors and just
  // restarts the tail on error.
  //
  // If timeoutMS is set, then if we don't get a new document every timeoutMS,
  // kill and restart the cursor. This is primarily a workaround for #8598.
  MongoConnection.prototype.tail = function (cursorDescription, docCallback, timeoutMS) {
    var self = this;
    if (!cursorDescription.options.tailable) throw new Error("Can only tail a tailable cursor");
    var cursor = self._createSynchronousCursor(cursorDescription);
    var stopped = false;
    var lastTS;
    var loop = function () {
      var doc = null;
      while (true) {
        if (stopped) return;
        try {
          doc = cursor._nextObjectPromiseWithTimeout(timeoutMS).await();
        } catch (err) {
          // There's no good way to figure out if this was actually an error from
          // Mongo, or just client-side (including our own timeout error). Ah
          // well. But either way, we need to retry the cursor (unless the failure
          // was because the observe got stopped).
          doc = null;
        }
        // Since we awaited a promise above, we need to check again to see if
        // we've been stopped before calling the callback.
        if (stopped) return;
        if (doc) {
          // If a tailable cursor contains a "ts" field, use it to recreate the
          // cursor on error. ("ts" is a standard that Mongo uses internally for
          // the oplog, and there's a special flag that lets you do binary search
          // on it instead of needing to use an index.)
          lastTS = doc.ts;
          docCallback(doc);
        } else {
          var newSelector = _.clone(cursorDescription.selector);
          if (lastTS) {
            newSelector.ts = {
              $gt: lastTS
            };
          }
          cursor = self._createSynchronousCursor(new CursorDescription(cursorDescription.collectionName, newSelector, cursorDescription.options));
          // Mongo failover takes many seconds.  Retry in a bit.  (Without this
          // setTimeout, we peg the CPU at 100% and never notice the actual
          // failover.
          Meteor.setTimeout(loop, 100);
          break;
        }
      }
    };
    Meteor.defer(loop);
    return {
      stop: function () {
        stopped = true;
        cursor.close();
      }
    };
  };
  MongoConnection.prototype._observeChanges = function (cursorDescription, ordered, callbacks, nonMutatingCallbacks) {
    var self = this;
    if (cursorDescription.options.tailable) {
      return self._observeChangesTailable(cursorDescription, ordered, callbacks);
    }

    // You may not filter out _id when observing changes, because the id is a core
    // part of the observeChanges API.
    const fieldsOptions = cursorDescription.options.projection || cursorDescription.options.fields;
    if (fieldsOptions && (fieldsOptions._id === 0 || fieldsOptions._id === false)) {
      throw Error("You may not observe a cursor with {fields: {_id: 0}}");
    }
    var observeKey = EJSON.stringify(_.extend({
      ordered: ordered
    }, cursorDescription));
    var multiplexer, observeDriver;
    var firstHandle = false;

    // Find a matching ObserveMultiplexer, or create a new one. This next block is
    // guaranteed to not yield (and it doesn't call anything that can observe a
    // new query), so no other calls to this function can interleave with it.
    Meteor._noYieldsAllowed(function () {
      if (_.has(self._observeMultiplexers, observeKey)) {
        multiplexer = self._observeMultiplexers[observeKey];
      } else {
        firstHandle = true;
        // Create a new ObserveMultiplexer.
        multiplexer = new ObserveMultiplexer({
          ordered: ordered,
          onStop: function () {
            delete self._observeMultiplexers[observeKey];
            observeDriver.stop();
          }
        });
        self._observeMultiplexers[observeKey] = multiplexer;
      }
    });
    var observeHandle = new ObserveHandle(multiplexer, callbacks, nonMutatingCallbacks);
    if (firstHandle) {
      var matcher, sorter;
      var canUseOplog = _.all([function () {
        // At a bare minimum, using the oplog requires us to have an oplog, to
        // want unordered callbacks, and to not want a callback on the polls
        // that won't happen.
        return self._oplogHandle && !ordered && !callbacks._testOnlyPollCallback;
      }, function () {
        // We need to be able to compile the selector. Fall back to polling for
        // some newfangled $selector that minimongo doesn't support yet.
        try {
          matcher = new Minimongo.Matcher(cursorDescription.selector);
          return true;
        } catch (e) {
          // XXX make all compilation errors MinimongoError or something
          //     so that this doesn't ignore unrelated exceptions
          return false;
        }
      }, function () {
        // ... and the selector itself needs to support oplog.
        return OplogObserveDriver.cursorSupported(cursorDescription, matcher);
      }, function () {
        // And we need to be able to compile the sort, if any.  eg, can't be
        // {$natural: 1}.
        if (!cursorDescription.options.sort) return true;
        try {
          sorter = new Minimongo.Sorter(cursorDescription.options.sort);
          return true;
        } catch (e) {
          // XXX make all compilation errors MinimongoError or something
          //     so that this doesn't ignore unrelated exceptions
          return false;
        }
      }], function (f) {
        return f();
      }); // invoke each function

      var driverClass = canUseOplog ? OplogObserveDriver : PollingObserveDriver;
      observeDriver = new driverClass({
        cursorDescription: cursorDescription,
        mongoHandle: self,
        multiplexer: multiplexer,
        ordered: ordered,
        matcher: matcher,
        // ignored by polling
        sorter: sorter,
        // ignored by polling
        _testOnlyPollCallback: callbacks._testOnlyPollCallback
      });

      // This field is only set for use in tests.
      multiplexer._observeDriver = observeDriver;
    }

    // Blocks until the initial adds have been sent.
    multiplexer.addHandleAndSendInitialAdds(observeHandle);
    return observeHandle;
  };

  // Listen for the invalidation messages that will trigger us to poll the
  // database for changes. If this selector specifies specific IDs, specify them
  // here, so that updates to different specific IDs don't cause us to poll.
  // listenCallback is the same kind of (notification, complete) callback passed
  // to InvalidationCrossbar.listen.

  listenAll = function (cursorDescription, listenCallback) {
    var listeners = [];
    forEachTrigger(cursorDescription, function (trigger) {
      listeners.push(DDPServer._InvalidationCrossbar.listen(trigger, listenCallback));
    });
    return {
      stop: function () {
        _.each(listeners, function (listener) {
          listener.stop();
        });
      }
    };
  };
  forEachTrigger = function (cursorDescription, triggerCallback) {
    var key = {
      collection: cursorDescription.collectionName
    };
    var specificIds = LocalCollection._idsMatchedBySelector(cursorDescription.selector);
    if (specificIds) {
      _.each(specificIds, function (id) {
        triggerCallback(_.extend({
          id: id
        }, key));
      });
      triggerCallback(_.extend({
        dropCollection: true,
        id: null
      }, key));
    } else {
      triggerCallback(key);
    }
    // Everyone cares about the database being dropped.
    triggerCallback({
      dropDatabase: true
    });
  };

  // observeChanges for tailable cursors on capped collections.
  //
  // Some differences from normal cursors:
  //   - Will never produce anything other than 'added' or 'addedBefore'. If you
  //     do update a document that has already been produced, this will not notice
  //     it.
  //   - If you disconnect and reconnect from Mongo, it will essentially restart
  //     the query, which will lead to duplicate results. This is pretty bad,
  //     but if you include a field called 'ts' which is inserted as
  //     new MongoInternals.MongoTimestamp(0, 0) (which is initialized to the
  //     current Mongo-style timestamp), we'll be able to find the place to
  //     restart properly. (This field is specifically understood by Mongo with an
  //     optimization which allows it to find the right place to start without
  //     an index on ts. It's how the oplog works.)
  //   - No callbacks are triggered synchronously with the call (there's no
  //     differentiation between "initial data" and "later changes"; everything
  //     that matches the query gets sent asynchronously).
  //   - De-duplication is not implemented.
  //   - Does not yet interact with the write fence. Probably, this should work by
  //     ignoring removes (which don't work on capped collections) and updates
  //     (which don't affect tailable cursors), and just keeping track of the ID
  //     of the inserted object, and closing the write fence once you get to that
  //     ID (or timestamp?).  This doesn't work well if the document doesn't match
  //     the query, though.  On the other hand, the write fence can close
  //     immediately if it does not match the query. So if we trust minimongo
  //     enough to accurately evaluate the query against the write fence, we
  //     should be able to do this...  Of course, minimongo doesn't even support
  //     Mongo Timestamps yet.
  MongoConnection.prototype._observeChangesTailable = function (cursorDescription, ordered, callbacks) {
    var self = this;

    // Tailable cursors only ever call added/addedBefore callbacks, so it's an
    // error if you didn't provide them.
    if (ordered && !callbacks.addedBefore || !ordered && !callbacks.added) {
      throw new Error("Can't observe an " + (ordered ? "ordered" : "unordered") + " tailable cursor without a " + (ordered ? "addedBefore" : "added") + " callback");
    }
    return self.tail(cursorDescription, function (doc) {
      var id = doc._id;
      delete doc._id;
      // The ts is an implementation detail. Hide it.
      delete doc.ts;
      if (ordered) {
        callbacks.addedBefore(id, doc, null);
      } else {
        callbacks.added(id, doc);
      }
    });
  };

  // XXX We probably need to find a better way to expose this. Right now
  // it's only used by tests, but in fact you need it in normal
  // operation to interact with capped collections.
  MongoInternals.MongoTimestamp = MongoDB.Timestamp;
  MongoInternals.Connection = MongoConnection;
}.call(this, module);
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"oplog_tailing.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/oplog_tailing.js                                                                                     //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let NpmModuleMongodb;
module.link("meteor/npm-mongo", {
  NpmModuleMongodb(v) {
    NpmModuleMongodb = v;
  }
}, 0);
var Future = Npm.require('fibers/future');
const {
  Long
} = NpmModuleMongodb;
OPLOG_COLLECTION = 'oplog.rs';
var TOO_FAR_BEHIND = process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000;
var TAIL_TIMEOUT = +process.env.METEOR_OPLOG_TAIL_TIMEOUT || 30000;
var showTS = function (ts) {
  return "Timestamp(" + ts.getHighBits() + ", " + ts.getLowBits() + ")";
};
idForOp = function (op) {
  if (op.op === 'd') return op.o._id;else if (op.op === 'i') return op.o._id;else if (op.op === 'u') return op.o2._id;else if (op.op === 'c') throw Error("Operator 'c' doesn't supply an object with id: " + EJSON.stringify(op));else throw Error("Unknown op: " + EJSON.stringify(op));
};
OplogHandle = function (oplogUrl, dbName) {
  var self = this;
  self._oplogUrl = oplogUrl;
  self._dbName = dbName;
  self._oplogLastEntryConnection = null;
  self._oplogTailConnection = null;
  self._stopped = false;
  self._tailHandle = null;
  self._readyFuture = new Future();
  self._crossbar = new DDPServer._Crossbar({
    factPackage: "mongo-livedata",
    factName: "oplog-watchers"
  });
  self._baseOplogSelector = {
    ns: new RegExp("^(?:" + [Meteor._escapeRegExp(self._dbName + "."), Meteor._escapeRegExp("admin.$cmd")].join("|") + ")"),
    $or: [{
      op: {
        $in: ['i', 'u', 'd']
      }
    },
    // drop collection
    {
      op: 'c',
      'o.drop': {
        $exists: true
      }
    }, {
      op: 'c',
      'o.dropDatabase': 1
    }, {
      op: 'c',
      'o.applyOps': {
        $exists: true
      }
    }]
  };

  // Data structures to support waitUntilCaughtUp(). Each oplog entry has a
  // MongoTimestamp object on it (which is not the same as a Date --- it's a
  // combination of time and an incrementing counter; see
  // http://docs.mongodb.org/manual/reference/bson-types/#timestamps).
  //
  // _catchingUpFutures is an array of {ts: MongoTimestamp, future: Future}
  // objects, sorted by ascending timestamp. _lastProcessedTS is the
  // MongoTimestamp of the last oplog entry we've processed.
  //
  // Each time we call waitUntilCaughtUp, we take a peek at the final oplog
  // entry in the db.  If we've already processed it (ie, it is not greater than
  // _lastProcessedTS), waitUntilCaughtUp immediately returns. Otherwise,
  // waitUntilCaughtUp makes a new Future and inserts it along with the final
  // timestamp entry that it read, into _catchingUpFutures. waitUntilCaughtUp
  // then waits on that future, which is resolved once _lastProcessedTS is
  // incremented to be past its timestamp by the worker fiber.
  //
  // XXX use a priority queue or something else that's faster than an array
  self._catchingUpFutures = [];
  self._lastProcessedTS = null;
  self._onSkippedEntriesHook = new Hook({
    debugPrintExceptions: "onSkippedEntries callback"
  });
  self._entryQueue = new Meteor._DoubleEndedQueue();
  self._workerActive = false;
  self._startTailing();
};
Object.assign(OplogHandle.prototype, {
  stop: function () {
    var self = this;
    if (self._stopped) return;
    self._stopped = true;
    if (self._tailHandle) self._tailHandle.stop();
    // XXX should close connections too
  },

  onOplogEntry: function (trigger, callback) {
    var self = this;
    if (self._stopped) throw new Error("Called onOplogEntry on stopped handle!");

    // Calling onOplogEntry requires us to wait for the tailing to be ready.
    self._readyFuture.wait();
    var originalCallback = callback;
    callback = Meteor.bindEnvironment(function (notification) {
      originalCallback(notification);
    }, function (err) {
      Meteor._debug("Error in oplog callback", err);
    });
    var listenHandle = self._crossbar.listen(trigger, callback);
    return {
      stop: function () {
        listenHandle.stop();
      }
    };
  },
  // Register a callback to be invoked any time we skip oplog entries (eg,
  // because we are too far behind).
  onSkippedEntries: function (callback) {
    var self = this;
    if (self._stopped) throw new Error("Called onSkippedEntries on stopped handle!");
    return self._onSkippedEntriesHook.register(callback);
  },
  // Calls `callback` once the oplog has been processed up to a point that is
  // roughly "now": specifically, once we've processed all ops that are
  // currently visible.
  // XXX become convinced that this is actually safe even if oplogConnection
  // is some kind of pool
  waitUntilCaughtUp: function () {
    var self = this;
    if (self._stopped) throw new Error("Called waitUntilCaughtUp on stopped handle!");

    // Calling waitUntilCaughtUp requries us to wait for the oplog connection to
    // be ready.
    self._readyFuture.wait();
    var lastEntry;
    while (!self._stopped) {
      // We need to make the selector at least as restrictive as the actual
      // tailing selector (ie, we need to specify the DB name) or else we might
      // find a TS that won't show up in the actual tail stream.
      try {
        lastEntry = self._oplogLastEntryConnection.findOne(OPLOG_COLLECTION, self._baseOplogSelector, {
          fields: {
            ts: 1
          },
          sort: {
            $natural: -1
          }
        });
        break;
      } catch (e) {
        // During failover (eg) if we get an exception we should log and retry
        // instead of crashing.
        Meteor._debug("Got exception while reading last entry", e);
        Meteor._sleepForMs(100);
      }
    }
    if (self._stopped) return;
    if (!lastEntry) {
      // Really, nothing in the oplog? Well, we've processed everything.
      return;
    }
    var ts = lastEntry.ts;
    if (!ts) throw Error("oplog entry without ts: " + EJSON.stringify(lastEntry));
    if (self._lastProcessedTS && ts.lessThanOrEqual(self._lastProcessedTS)) {
      // We've already caught up to here.
      return;
    }

    // Insert the future into our list. Almost always, this will be at the end,
    // but it's conceivable that if we fail over from one primary to another,
    // the oplog entries we see will go backwards.
    var insertAfter = self._catchingUpFutures.length;
    while (insertAfter - 1 > 0 && self._catchingUpFutures[insertAfter - 1].ts.greaterThan(ts)) {
      insertAfter--;
    }
    var f = new Future();
    self._catchingUpFutures.splice(insertAfter, 0, {
      ts: ts,
      future: f
    });
    f.wait();
  },
  _startTailing: function () {
    var self = this;
    // First, make sure that we're talking to the local database.
    var mongodbUri = Npm.require('mongodb-uri');
    if (mongodbUri.parse(self._oplogUrl).database !== 'local') {
      throw Error("$MONGO_OPLOG_URL must be set to the 'local' database of " + "a Mongo replica set");
    }

    // We make two separate connections to Mongo. The Node Mongo driver
    // implements a naive round-robin connection pool: each "connection" is a
    // pool of several (5 by default) TCP connections, and each request is
    // rotated through the pools. Tailable cursor queries block on the server
    // until there is some data to return (or until a few seconds have
    // passed). So if the connection pool used for tailing cursors is the same
    // pool used for other queries, the other queries will be delayed by seconds
    // 1/5 of the time.
    //
    // The tail connection will only ever be running a single tail command, so
    // it only needs to make one underlying TCP connection.
    self._oplogTailConnection = new MongoConnection(self._oplogUrl, {
      maxPoolSize: 1
    });
    // XXX better docs, but: it's to get monotonic results
    // XXX is it safe to say "if there's an in flight query, just use its
    //     results"? I don't think so but should consider that
    self._oplogLastEntryConnection = new MongoConnection(self._oplogUrl, {
      maxPoolSize: 1
    });

    // Now, make sure that there actually is a repl set here. If not, oplog
    // tailing won't ever find anything!
    // More on the isMasterDoc
    // https://docs.mongodb.com/manual/reference/command/isMaster/
    var f = new Future();
    self._oplogLastEntryConnection.db.admin().command({
      ismaster: 1
    }, f.resolver());
    var isMasterDoc = f.wait();
    if (!(isMasterDoc && isMasterDoc.setName)) {
      throw Error("$MONGO_OPLOG_URL must be set to the 'local' database of " + "a Mongo replica set");
    }

    // Find the last oplog entry.
    var lastOplogEntry = self._oplogLastEntryConnection.findOne(OPLOG_COLLECTION, {}, {
      sort: {
        $natural: -1
      },
      fields: {
        ts: 1
      }
    });
    var oplogSelector = _.clone(self._baseOplogSelector);
    if (lastOplogEntry) {
      // Start after the last entry that currently exists.
      oplogSelector.ts = {
        $gt: lastOplogEntry.ts
      };
      // If there are any calls to callWhenProcessedLatest before any other
      // oplog entries show up, allow callWhenProcessedLatest to call its
      // callback immediately.
      self._lastProcessedTS = lastOplogEntry.ts;
    }
    var cursorDescription = new CursorDescription(OPLOG_COLLECTION, oplogSelector, {
      tailable: true
    });

    // Start tailing the oplog.
    //
    // We restart the low-level oplog query every 30 seconds if we didn't get a
    // doc. This is a workaround for #8598: the Node Mongo driver has at least
    // one bug that can lead to query callbacks never getting called (even with
    // an error) when leadership failover occur.
    self._tailHandle = self._oplogTailConnection.tail(cursorDescription, function (doc) {
      self._entryQueue.push(doc);
      self._maybeStartWorker();
    }, TAIL_TIMEOUT);
    self._readyFuture.return();
  },
  _maybeStartWorker: function () {
    var self = this;
    if (self._workerActive) return;
    self._workerActive = true;
    Meteor.defer(function () {
      // May be called recursively in case of transactions.
      function handleDoc(doc) {
        if (doc.ns === "admin.$cmd") {
          if (doc.o.applyOps) {
            // This was a successful transaction, so we need to apply the
            // operations that were involved.
            let nextTimestamp = doc.ts;
            doc.o.applyOps.forEach(op => {
              // See https://github.com/meteor/meteor/issues/10420.
              if (!op.ts) {
                op.ts = nextTimestamp;
                nextTimestamp = nextTimestamp.add(Long.ONE);
              }
              handleDoc(op);
            });
            return;
          }
          throw new Error("Unknown command " + EJSON.stringify(doc));
        }
        const trigger = {
          dropCollection: false,
          dropDatabase: false,
          op: doc
        };
        if (typeof doc.ns === "string" && doc.ns.startsWith(self._dbName + ".")) {
          trigger.collection = doc.ns.slice(self._dbName.length + 1);
        }

        // Is it a special command and the collection name is hidden
        // somewhere in operator?
        if (trigger.collection === "$cmd") {
          if (doc.o.dropDatabase) {
            delete trigger.collection;
            trigger.dropDatabase = true;
          } else if (_.has(doc.o, "drop")) {
            trigger.collection = doc.o.drop;
            trigger.dropCollection = true;
            trigger.id = null;
          } else {
            throw Error("Unknown command " + EJSON.stringify(doc));
          }
        } else {
          // All other ops have an id.
          trigger.id = idForOp(doc);
        }
        self._crossbar.fire(trigger);
      }
      try {
        while (!self._stopped && !self._entryQueue.isEmpty()) {
          // Are we too far behind? Just tell our observers that they need to
          // repoll, and drop our queue.
          if (self._entryQueue.length > TOO_FAR_BEHIND) {
            var lastEntry = self._entryQueue.pop();
            self._entryQueue.clear();
            self._onSkippedEntriesHook.each(function (callback) {
              callback();
              return true;
            });

            // Free any waitUntilCaughtUp() calls that were waiting for us to
            // pass something that we just skipped.
            self._setLastProcessedTS(lastEntry.ts);
            continue;
          }
          const doc = self._entryQueue.shift();

          // Fire trigger(s) for this doc.
          handleDoc(doc);

          // Now that we've processed this operation, process pending
          // sequencers.
          if (doc.ts) {
            self._setLastProcessedTS(doc.ts);
          } else {
            throw Error("oplog entry without ts: " + EJSON.stringify(doc));
          }
        }
      } finally {
        self._workerActive = false;
      }
    });
  },
  _setLastProcessedTS: function (ts) {
    var self = this;
    self._lastProcessedTS = ts;
    while (!_.isEmpty(self._catchingUpFutures) && self._catchingUpFutures[0].ts.lessThanOrEqual(self._lastProcessedTS)) {
      var sequencer = self._catchingUpFutures.shift();
      sequencer.future.return();
    }
  },
  //Methods used on tests to dinamically change TOO_FAR_BEHIND
  _defineTooFarBehind: function (value) {
    TOO_FAR_BEHIND = value;
  },
  _resetTooFarBehind: function () {
    TOO_FAR_BEHIND = process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000;
  }
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"observe_multiplex.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/observe_multiplex.js                                                                                 //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
const _excluded = ["_id"];
let _objectWithoutProperties;
module.link("@babel/runtime/helpers/objectWithoutProperties", {
  default(v) {
    _objectWithoutProperties = v;
  }
}, 0);
var Future = Npm.require('fibers/future');
ObserveMultiplexer = function (options) {
  var self = this;
  if (!options || !_.has(options, 'ordered')) throw Error("must specified ordered");
  Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-multiplexers", 1);
  self._ordered = options.ordered;
  self._onStop = options.onStop || function () {};
  self._queue = new Meteor._SynchronousQueue();
  self._handles = {};
  self._readyFuture = new Future();
  self._cache = new LocalCollection._CachingChangeObserver({
    ordered: options.ordered
  });
  // Number of addHandleAndSendInitialAdds tasks scheduled but not yet
  // running. removeHandle uses this to know if it's time to call the onStop
  // callback.
  self._addHandleTasksScheduledButNotPerformed = 0;
  _.each(self.callbackNames(), function (callbackName) {
    self[callbackName] = function /* ... */
    () {
      self._applyCallback(callbackName, _.toArray(arguments));
    };
  });
};
_.extend(ObserveMultiplexer.prototype, {
  addHandleAndSendInitialAdds: function (handle) {
    var self = this;

    // Check this before calling runTask (even though runTask does the same
    // check) so that we don't leak an ObserveMultiplexer on error by
    // incrementing _addHandleTasksScheduledButNotPerformed and never
    // decrementing it.
    if (!self._queue.safeToRunTask()) throw new Error("Can't call observeChanges from an observe callback on the same query");
    ++self._addHandleTasksScheduledButNotPerformed;
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-handles", 1);
    self._queue.runTask(function () {
      self._handles[handle._id] = handle;
      // Send out whatever adds we have so far (whether or not we the
      // multiplexer is ready).
      self._sendAdds(handle);
      --self._addHandleTasksScheduledButNotPerformed;
    });
    // *outside* the task, since otherwise we'd deadlock
    self._readyFuture.wait();
  },
  // Remove an observe handle. If it was the last observe handle, call the
  // onStop callback; you cannot add any more observe handles after this.
  //
  // This is not synchronized with polls and handle additions: this means that
  // you can safely call it from within an observe callback, but it also means
  // that we have to be careful when we iterate over _handles.
  removeHandle: function (id) {
    var self = this;

    // This should not be possible: you can only call removeHandle by having
    // access to the ObserveHandle, which isn't returned to user code until the
    // multiplex is ready.
    if (!self._ready()) throw new Error("Can't remove handles until the multiplex is ready");
    delete self._handles[id];
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-handles", -1);
    if (_.isEmpty(self._handles) && self._addHandleTasksScheduledButNotPerformed === 0) {
      self._stop();
    }
  },
  _stop: function (options) {
    var self = this;
    options = options || {};

    // It shouldn't be possible for us to stop when all our handles still
    // haven't been returned from observeChanges!
    if (!self._ready() && !options.fromQueryError) throw Error("surprising _stop: not ready");

    // Call stop callback (which kills the underlying process which sends us
    // callbacks and removes us from the connection's dictionary).
    self._onStop();
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-multiplexers", -1);

    // Cause future addHandleAndSendInitialAdds calls to throw (but the onStop
    // callback should make our connection forget about us).
    self._handles = null;
  },
  // Allows all addHandleAndSendInitialAdds calls to return, once all preceding
  // adds have been processed. Does not block.
  ready: function () {
    var self = this;
    self._queue.queueTask(function () {
      if (self._ready()) throw Error("can't make ObserveMultiplex ready twice!");
      self._readyFuture.return();
    });
  },
  // If trying to execute the query results in an error, call this. This is
  // intended for permanent errors, not transient network errors that could be
  // fixed. It should only be called before ready(), because if you called ready
  // that meant that you managed to run the query once. It will stop this
  // ObserveMultiplex and cause addHandleAndSendInitialAdds calls (and thus
  // observeChanges calls) to throw the error.
  queryError: function (err) {
    var self = this;
    self._queue.runTask(function () {
      if (self._ready()) throw Error("can't claim query has an error after it worked!");
      self._stop({
        fromQueryError: true
      });
      self._readyFuture.throw(err);
    });
  },
  // Calls "cb" once the effects of all "ready", "addHandleAndSendInitialAdds"
  // and observe callbacks which came before this call have been propagated to
  // all handles. "ready" must have already been called on this multiplexer.
  onFlush: function (cb) {
    var self = this;
    self._queue.queueTask(function () {
      if (!self._ready()) throw Error("only call onFlush on a multiplexer that will be ready");
      cb();
    });
  },
  callbackNames: function () {
    var self = this;
    if (self._ordered) return ["addedBefore", "changed", "movedBefore", "removed"];else return ["added", "changed", "removed"];
  },
  _ready: function () {
    return this._readyFuture.isResolved();
  },
  _applyCallback: function (callbackName, args) {
    var self = this;
    self._queue.queueTask(function () {
      // If we stopped in the meantime, do nothing.
      if (!self._handles) return;

      // First, apply the change to the cache.
      self._cache.applyChange[callbackName].apply(null, args);

      // If we haven't finished the initial adds, then we should only be getting
      // adds.
      if (!self._ready() && callbackName !== 'added' && callbackName !== 'addedBefore') {
        throw new Error("Got " + callbackName + " during initial adds");
      }

      // Now multiplex the callbacks out to all observe handles. It's OK if
      // these calls yield; since we're inside a task, no other use of our queue
      // can continue until these are done. (But we do have to be careful to not
      // use a handle that got removed, because removeHandle does not use the
      // queue; thus, we iterate over an array of keys that we control.)
      _.each(_.keys(self._handles), function (handleId) {
        var handle = self._handles && self._handles[handleId];
        if (!handle) return;
        var callback = handle['_' + callbackName];
        // clone arguments so that callbacks can mutate their arguments
        callback && callback.apply(null, handle.nonMutatingCallbacks ? args : EJSON.clone(args));
      });
    });
  },
  // Sends initial adds to a handle. It should only be called from within a task
  // (the task that is processing the addHandleAndSendInitialAdds call). It
  // synchronously invokes the handle's added or addedBefore; there's no need to
  // flush the queue afterwards to ensure that the callbacks get out.
  _sendAdds: function (handle) {
    var self = this;
    if (self._queue.safeToRunTask()) throw Error("_sendAdds may only be called from within a task!");
    var add = self._ordered ? handle._addedBefore : handle._added;
    if (!add) return;
    // note: docs may be an _IdMap or an OrderedDict
    self._cache.docs.forEach(function (doc, id) {
      if (!_.has(self._handles, handle._id)) throw Error("handle got removed before sending initial adds!");
      const _ref = handle.nonMutatingCallbacks ? doc : EJSON.clone(doc),
        {
          _id
        } = _ref,
        fields = _objectWithoutProperties(_ref, _excluded);
      if (self._ordered) add(id, fields, null); // we're going in order, so add at end
      else add(id, fields);
    });
  }
});
var nextObserveHandleId = 1;

// When the callbacks do not mutate the arguments, we can skip a lot of data clones
ObserveHandle = function (multiplexer, callbacks) {
  let nonMutatingCallbacks = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
  var self = this;
  // The end user is only supposed to call stop().  The other fields are
  // accessible to the multiplexer, though.
  self._multiplexer = multiplexer;
  _.each(multiplexer.callbackNames(), function (name) {
    if (callbacks[name]) {
      self['_' + name] = callbacks[name];
    } else if (name === "addedBefore" && callbacks.added) {
      // Special case: if you specify "added" and "movedBefore", you get an
      // ordered observe where for some reason you don't get ordering data on
      // the adds.  I dunno, we wrote tests for it, there must have been a
      // reason.
      self._addedBefore = function (id, fields, before) {
        callbacks.added(id, fields);
      };
    }
  });
  self._stopped = false;
  self._id = nextObserveHandleId++;
  self.nonMutatingCallbacks = nonMutatingCallbacks;
};
ObserveHandle.prototype.stop = function () {
  var self = this;
  if (self._stopped) return;
  self._stopped = true;
  self._multiplexer.removeHandle(self._id);
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"doc_fetcher.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/doc_fetcher.js                                                                                       //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  DocFetcher: () => DocFetcher
});
var Fiber = Npm.require('fibers');
class DocFetcher {
  constructor(mongoConnection) {
    this._mongoConnection = mongoConnection;
    // Map from op -> [callback]
    this._callbacksForOp = new Map();
  }

  // Fetches document "id" from collectionName, returning it or null if not
  // found.
  //
  // If you make multiple calls to fetch() with the same op reference,
  // DocFetcher may assume that they all return the same document. (It does
  // not check to see if collectionName/id match.)
  //
  // You may assume that callback is never called synchronously (and in fact
  // OplogObserveDriver does so).
  fetch(collectionName, id, op, callback) {
    const self = this;
    check(collectionName, String);
    check(op, Object);

    // If there's already an in-progress fetch for this cache key, yield until
    // it's done and return whatever it returns.
    if (self._callbacksForOp.has(op)) {
      self._callbacksForOp.get(op).push(callback);
      return;
    }
    const callbacks = [callback];
    self._callbacksForOp.set(op, callbacks);
    Fiber(function () {
      try {
        var doc = self._mongoConnection.findOne(collectionName, {
          _id: id
        }) || null;
        // Return doc to all relevant callbacks. Note that this array can
        // continue to grow during callback excecution.
        while (callbacks.length > 0) {
          // Clone the document so that the various calls to fetch don't return
          // objects that are intertwingled with each other. Clone before
          // popping the future, so that if clone throws, the error gets passed
          // to the next callback.
          callbacks.pop()(null, EJSON.clone(doc));
        }
      } catch (e) {
        while (callbacks.length > 0) {
          callbacks.pop()(e);
        }
      } finally {
        // XXX consider keeping the doc around for a period of time before
        // removing from the cache
        self._callbacksForOp.delete(op);
      }
    }).run();
  }
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"polling_observe_driver.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/polling_observe_driver.js                                                                            //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
var POLLING_THROTTLE_MS = +process.env.METEOR_POLLING_THROTTLE_MS || 50;
var POLLING_INTERVAL_MS = +process.env.METEOR_POLLING_INTERVAL_MS || 10 * 1000;
PollingObserveDriver = function (options) {
  var self = this;
  self._cursorDescription = options.cursorDescription;
  self._mongoHandle = options.mongoHandle;
  self._ordered = options.ordered;
  self._multiplexer = options.multiplexer;
  self._stopCallbacks = [];
  self._stopped = false;
  self._synchronousCursor = self._mongoHandle._createSynchronousCursor(self._cursorDescription);

  // previous results snapshot.  on each poll cycle, diffs against
  // results drives the callbacks.
  self._results = null;

  // The number of _pollMongo calls that have been added to self._taskQueue but
  // have not started running. Used to make sure we never schedule more than one
  // _pollMongo (other than possibly the one that is currently running). It's
  // also used by _suspendPolling to pretend there's a poll scheduled. Usually,
  // it's either 0 (for "no polls scheduled other than maybe one currently
  // running") or 1 (for "a poll scheduled that isn't running yet"), but it can
  // also be 2 if incremented by _suspendPolling.
  self._pollsScheduledButNotStarted = 0;
  self._pendingWrites = []; // people to notify when polling completes

  // Make sure to create a separately throttled function for each
  // PollingObserveDriver object.
  self._ensurePollIsScheduled = _.throttle(self._unthrottledEnsurePollIsScheduled, self._cursorDescription.options.pollingThrottleMs || POLLING_THROTTLE_MS /* ms */);

  // XXX figure out if we still need a queue
  self._taskQueue = new Meteor._SynchronousQueue();
  var listenersHandle = listenAll(self._cursorDescription, function (notification) {
    // When someone does a transaction that might affect us, schedule a poll
    // of the database. If that transaction happens inside of a write fence,
    // block the fence until we've polled and notified observers.
    var fence = DDPServer._CurrentWriteFence.get();
    if (fence) self._pendingWrites.push(fence.beginWrite());
    // Ensure a poll is scheduled... but if we already know that one is,
    // don't hit the throttled _ensurePollIsScheduled function (which might
    // lead to us calling it unnecessarily in <pollingThrottleMs> ms).
    if (self._pollsScheduledButNotStarted === 0) self._ensurePollIsScheduled();
  });
  self._stopCallbacks.push(function () {
    listenersHandle.stop();
  });

  // every once and a while, poll even if we don't think we're dirty, for
  // eventual consistency with database writes from outside the Meteor
  // universe.
  //
  // For testing, there's an undocumented callback argument to observeChanges
  // which disables time-based polling and gets called at the beginning of each
  // poll.
  if (options._testOnlyPollCallback) {
    self._testOnlyPollCallback = options._testOnlyPollCallback;
  } else {
    var pollingInterval = self._cursorDescription.options.pollingIntervalMs || self._cursorDescription.options._pollingInterval ||
    // COMPAT with 1.2
    POLLING_INTERVAL_MS;
    var intervalHandle = Meteor.setInterval(_.bind(self._ensurePollIsScheduled, self), pollingInterval);
    self._stopCallbacks.push(function () {
      Meteor.clearInterval(intervalHandle);
    });
  }

  // Make sure we actually poll soon!
  self._unthrottledEnsurePollIsScheduled();
  Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-polling", 1);
};
_.extend(PollingObserveDriver.prototype, {
  // This is always called through _.throttle (except once at startup).
  _unthrottledEnsurePollIsScheduled: function () {
    var self = this;
    if (self._pollsScheduledButNotStarted > 0) return;
    ++self._pollsScheduledButNotStarted;
    self._taskQueue.queueTask(function () {
      self._pollMongo();
    });
  },
  // test-only interface for controlling polling.
  //
  // _suspendPolling blocks until any currently running and scheduled polls are
  // done, and prevents any further polls from being scheduled. (new
  // ObserveHandles can be added and receive their initial added callbacks,
  // though.)
  //
  // _resumePolling immediately polls, and allows further polls to occur.
  _suspendPolling: function () {
    var self = this;
    // Pretend that there's another poll scheduled (which will prevent
    // _ensurePollIsScheduled from queueing any more polls).
    ++self._pollsScheduledButNotStarted;
    // Now block until all currently running or scheduled polls are done.
    self._taskQueue.runTask(function () {});

    // Confirm that there is only one "poll" (the fake one we're pretending to
    // have) scheduled.
    if (self._pollsScheduledButNotStarted !== 1) throw new Error("_pollsScheduledButNotStarted is " + self._pollsScheduledButNotStarted);
  },
  _resumePolling: function () {
    var self = this;
    // We should be in the same state as in the end of _suspendPolling.
    if (self._pollsScheduledButNotStarted !== 1) throw new Error("_pollsScheduledButNotStarted is " + self._pollsScheduledButNotStarted);
    // Run a poll synchronously (which will counteract the
    // ++_pollsScheduledButNotStarted from _suspendPolling).
    self._taskQueue.runTask(function () {
      self._pollMongo();
    });
  },
  _pollMongo: function () {
    var self = this;
    --self._pollsScheduledButNotStarted;
    if (self._stopped) return;
    var first = false;
    var newResults;
    var oldResults = self._results;
    if (!oldResults) {
      first = true;
      // XXX maybe use OrderedDict instead?
      oldResults = self._ordered ? [] : new LocalCollection._IdMap();
    }
    self._testOnlyPollCallback && self._testOnlyPollCallback();

    // Save the list of pending writes which this round will commit.
    var writesForCycle = self._pendingWrites;
    self._pendingWrites = [];

    // Get the new query results. (This yields.)
    try {
      newResults = self._synchronousCursor.getRawObjects(self._ordered);
    } catch (e) {
      if (first && typeof e.code === 'number') {
        // This is an error document sent to us by mongod, not a connection
        // error generated by the client. And we've never seen this query work
        // successfully. Probably it's a bad selector or something, so we should
        // NOT retry. Instead, we should halt the observe (which ends up calling
        // `stop` on us).
        self._multiplexer.queryError(new Error("Exception while polling query " + JSON.stringify(self._cursorDescription) + ": " + e.message));
        return;
      }

      // getRawObjects can throw if we're having trouble talking to the
      // database.  That's fine --- we will repoll later anyway. But we should
      // make sure not to lose track of this cycle's writes.
      // (It also can throw if there's just something invalid about this query;
      // unfortunately the ObserveDriver API doesn't provide a good way to
      // "cancel" the observe from the inside in this case.
      Array.prototype.push.apply(self._pendingWrites, writesForCycle);
      Meteor._debug("Exception while polling query " + JSON.stringify(self._cursorDescription), e);
      return;
    }

    // Run diffs.
    if (!self._stopped) {
      LocalCollection._diffQueryChanges(self._ordered, oldResults, newResults, self._multiplexer);
    }

    // Signals the multiplexer to allow all observeChanges calls that share this
    // multiplexer to return. (This happens asynchronously, via the
    // multiplexer's queue.)
    if (first) self._multiplexer.ready();

    // Replace self._results atomically.  (This assignment is what makes `first`
    // stay through on the next cycle, so we've waited until after we've
    // committed to ready-ing the multiplexer.)
    self._results = newResults;

    // Once the ObserveMultiplexer has processed everything we've done in this
    // round, mark all the writes which existed before this call as
    // commmitted. (If new writes have shown up in the meantime, there'll
    // already be another _pollMongo task scheduled.)
    self._multiplexer.onFlush(function () {
      _.each(writesForCycle, function (w) {
        w.committed();
      });
    });
  },
  stop: function () {
    var self = this;
    self._stopped = true;
    _.each(self._stopCallbacks, function (c) {
      c();
    });
    // Release any write fences that are waiting on us.
    _.each(self._pendingWrites, function (w) {
      w.committed();
    });
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-polling", -1);
  }
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"oplog_observe_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/oplog_observe_driver.js                                                                              //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let oplogV2V1Converter;
module.link("./oplog_v2_converter", {
  oplogV2V1Converter(v) {
    oplogV2V1Converter = v;
  }
}, 0);
var Future = Npm.require('fibers/future');
var PHASE = {
  QUERYING: "QUERYING",
  FETCHING: "FETCHING",
  STEADY: "STEADY"
};

// Exception thrown by _needToPollQuery which unrolls the stack up to the
// enclosing call to finishIfNeedToPollQuery.
var SwitchedToQuery = function () {};
var finishIfNeedToPollQuery = function (f) {
  return function () {
    try {
      f.apply(this, arguments);
    } catch (e) {
      if (!(e instanceof SwitchedToQuery)) throw e;
    }
  };
};
var currentId = 0;

// OplogObserveDriver is an alternative to PollingObserveDriver which follows
// the Mongo operation log instead of just re-polling the query. It obeys the
// same simple interface: constructing it starts sending observeChanges
// callbacks (and a ready() invocation) to the ObserveMultiplexer, and you stop
// it by calling the stop() method.
OplogObserveDriver = function (options) {
  var self = this;
  self._usesOplog = true; // tests look at this

  self._id = currentId;
  currentId++;
  self._cursorDescription = options.cursorDescription;
  self._mongoHandle = options.mongoHandle;
  self._multiplexer = options.multiplexer;
  if (options.ordered) {
    throw Error("OplogObserveDriver only supports unordered observeChanges");
  }
  var sorter = options.sorter;
  // We don't support $near and other geo-queries so it's OK to initialize the
  // comparator only once in the constructor.
  var comparator = sorter && sorter.getComparator();
  if (options.cursorDescription.options.limit) {
    // There are several properties ordered driver implements:
    // - _limit is a positive number
    // - _comparator is a function-comparator by which the query is ordered
    // - _unpublishedBuffer is non-null Min/Max Heap,
    //                      the empty buffer in STEADY phase implies that the
    //                      everything that matches the queries selector fits
    //                      into published set.
    // - _published - Max Heap (also implements IdMap methods)

    var heapOptions = {
      IdMap: LocalCollection._IdMap
    };
    self._limit = self._cursorDescription.options.limit;
    self._comparator = comparator;
    self._sorter = sorter;
    self._unpublishedBuffer = new MinMaxHeap(comparator, heapOptions);
    // We need something that can find Max value in addition to IdMap interface
    self._published = new MaxHeap(comparator, heapOptions);
  } else {
    self._limit = 0;
    self._comparator = null;
    self._sorter = null;
    self._unpublishedBuffer = null;
    self._published = new LocalCollection._IdMap();
  }

  // Indicates if it is safe to insert a new document at the end of the buffer
  // for this query. i.e. it is known that there are no documents matching the
  // selector those are not in published or buffer.
  self._safeAppendToBuffer = false;
  self._stopped = false;
  self._stopHandles = [];
  Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-oplog", 1);
  self._registerPhaseChange(PHASE.QUERYING);
  self._matcher = options.matcher;
  // we are now using projection, not fields in the cursor description even if you pass {fields}
  // in the cursor construction
  var projection = self._cursorDescription.options.fields || self._cursorDescription.options.projection || {};
  self._projectionFn = LocalCollection._compileProjection(projection);
  // Projection function, result of combining important fields for selector and
  // existing fields projection
  self._sharedProjection = self._matcher.combineIntoProjection(projection);
  if (sorter) self._sharedProjection = sorter.combineIntoProjection(self._sharedProjection);
  self._sharedProjectionFn = LocalCollection._compileProjection(self._sharedProjection);
  self._needToFetch = new LocalCollection._IdMap();
  self._currentlyFetching = null;
  self._fetchGeneration = 0;
  self._requeryWhenDoneThisQuery = false;
  self._writesToCommitWhenWeReachSteady = [];

  // If the oplog handle tells us that it skipped some entries (because it got
  // behind, say), re-poll.
  self._stopHandles.push(self._mongoHandle._oplogHandle.onSkippedEntries(finishIfNeedToPollQuery(function () {
    self._needToPollQuery();
  })));
  forEachTrigger(self._cursorDescription, function (trigger) {
    self._stopHandles.push(self._mongoHandle._oplogHandle.onOplogEntry(trigger, function (notification) {
      Meteor._noYieldsAllowed(finishIfNeedToPollQuery(function () {
        var op = notification.op;
        if (notification.dropCollection || notification.dropDatabase) {
          // Note: this call is not allowed to block on anything (especially
          // on waiting for oplog entries to catch up) because that will block
          // onOplogEntry!
          self._needToPollQuery();
        } else {
          // All other operators should be handled depending on phase
          if (self._phase === PHASE.QUERYING) {
            self._handleOplogEntryQuerying(op);
          } else {
            self._handleOplogEntrySteadyOrFetching(op);
          }
        }
      }));
    }));
  });

  // XXX ordering w.r.t. everything else?
  self._stopHandles.push(listenAll(self._cursorDescription, function (notification) {
    // If we're not in a pre-fire write fence, we don't have to do anything.
    var fence = DDPServer._CurrentWriteFence.get();
    if (!fence || fence.fired) return;
    if (fence._oplogObserveDrivers) {
      fence._oplogObserveDrivers[self._id] = self;
      return;
    }
    fence._oplogObserveDrivers = {};
    fence._oplogObserveDrivers[self._id] = self;
    fence.onBeforeFire(function () {
      var drivers = fence._oplogObserveDrivers;
      delete fence._oplogObserveDrivers;

      // This fence cannot fire until we've caught up to "this point" in the
      // oplog, and all observers made it back to the steady state.
      self._mongoHandle._oplogHandle.waitUntilCaughtUp();
      _.each(drivers, function (driver) {
        if (driver._stopped) return;
        var write = fence.beginWrite();
        if (driver._phase === PHASE.STEADY) {
          // Make sure that all of the callbacks have made it through the
          // multiplexer and been delivered to ObserveHandles before committing
          // writes.
          driver._multiplexer.onFlush(function () {
            write.committed();
          });
        } else {
          driver._writesToCommitWhenWeReachSteady.push(write);
        }
      });
    });
  }));

  // When Mongo fails over, we need to repoll the query, in case we processed an
  // oplog entry that got rolled back.
  self._stopHandles.push(self._mongoHandle._onFailover(finishIfNeedToPollQuery(function () {
    self._needToPollQuery();
  })));

  // Give _observeChanges a chance to add the new ObserveHandle to our
  // multiplexer, so that the added calls get streamed.
  Meteor.defer(finishIfNeedToPollQuery(function () {
    self._runInitialQuery();
  }));
};
_.extend(OplogObserveDriver.prototype, {
  _addPublished: function (id, doc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var fields = _.clone(doc);
      delete fields._id;
      self._published.set(id, self._sharedProjectionFn(doc));
      self._multiplexer.added(id, self._projectionFn(fields));

      // After adding this document, the published set might be overflowed
      // (exceeding capacity specified by limit). If so, push the maximum
      // element to the buffer, we might want to save it in memory to reduce the
      // amount of Mongo lookups in the future.
      if (self._limit && self._published.size() > self._limit) {
        // XXX in theory the size of published is no more than limit+1
        if (self._published.size() !== self._limit + 1) {
          throw new Error("After adding to published, " + (self._published.size() - self._limit) + " documents are overflowing the set");
        }
        var overflowingDocId = self._published.maxElementId();
        var overflowingDoc = self._published.get(overflowingDocId);
        if (EJSON.equals(overflowingDocId, id)) {
          throw new Error("The document just added is overflowing the published set");
        }
        self._published.remove(overflowingDocId);
        self._multiplexer.removed(overflowingDocId);
        self._addBuffered(overflowingDocId, overflowingDoc);
      }
    });
  },
  _removePublished: function (id) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._published.remove(id);
      self._multiplexer.removed(id);
      if (!self._limit || self._published.size() === self._limit) return;
      if (self._published.size() > self._limit) throw Error("self._published got too big");

      // OK, we are publishing less than the limit. Maybe we should look in the
      // buffer to find the next element past what we were publishing before.

      if (!self._unpublishedBuffer.empty()) {
        // There's something in the buffer; move the first thing in it to
        // _published.
        var newDocId = self._unpublishedBuffer.minElementId();
        var newDoc = self._unpublishedBuffer.get(newDocId);
        self._removeBuffered(newDocId);
        self._addPublished(newDocId, newDoc);
        return;
      }

      // There's nothing in the buffer.  This could mean one of a few things.

      // (a) We could be in the middle of re-running the query (specifically, we
      // could be in _publishNewResults). In that case, _unpublishedBuffer is
      // empty because we clear it at the beginning of _publishNewResults. In
      // this case, our caller already knows the entire answer to the query and
      // we don't need to do anything fancy here.  Just return.
      if (self._phase === PHASE.QUERYING) return;

      // (b) We're pretty confident that the union of _published and
      // _unpublishedBuffer contain all documents that match selector. Because
      // _unpublishedBuffer is empty, that means we're confident that _published
      // contains all documents that match selector. So we have nothing to do.
      if (self._safeAppendToBuffer) return;

      // (c) Maybe there are other documents out there that should be in our
      // buffer. But in that case, when we emptied _unpublishedBuffer in
      // _removeBuffered, we should have called _needToPollQuery, which will
      // either put something in _unpublishedBuffer or set _safeAppendToBuffer
      // (or both), and it will put us in QUERYING for that whole time. So in
      // fact, we shouldn't be able to get here.

      throw new Error("Buffer inexplicably empty");
    });
  },
  _changePublished: function (id, oldDoc, newDoc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._published.set(id, self._sharedProjectionFn(newDoc));
      var projectedNew = self._projectionFn(newDoc);
      var projectedOld = self._projectionFn(oldDoc);
      var changed = DiffSequence.makeChangedFields(projectedNew, projectedOld);
      if (!_.isEmpty(changed)) self._multiplexer.changed(id, changed);
    });
  },
  _addBuffered: function (id, doc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._unpublishedBuffer.set(id, self._sharedProjectionFn(doc));

      // If something is overflowing the buffer, we just remove it from cache
      if (self._unpublishedBuffer.size() > self._limit) {
        var maxBufferedId = self._unpublishedBuffer.maxElementId();
        self._unpublishedBuffer.remove(maxBufferedId);

        // Since something matching is removed from cache (both published set and
        // buffer), set flag to false
        self._safeAppendToBuffer = false;
      }
    });
  },
  // Is called either to remove the doc completely from matching set or to move
  // it to the published set later.
  _removeBuffered: function (id) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._unpublishedBuffer.remove(id);
      // To keep the contract "buffer is never empty in STEADY phase unless the
      // everything matching fits into published" true, we poll everything as
      // soon as we see the buffer becoming empty.
      if (!self._unpublishedBuffer.size() && !self._safeAppendToBuffer) self._needToPollQuery();
    });
  },
  // Called when a document has joined the "Matching" results set.
  // Takes responsibility of keeping _unpublishedBuffer in sync with _published
  // and the effect of limit enforced.
  _addMatching: function (doc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var id = doc._id;
      if (self._published.has(id)) throw Error("tried to add something already published " + id);
      if (self._limit && self._unpublishedBuffer.has(id)) throw Error("tried to add something already existed in buffer " + id);
      var limit = self._limit;
      var comparator = self._comparator;
      var maxPublished = limit && self._published.size() > 0 ? self._published.get(self._published.maxElementId()) : null;
      var maxBuffered = limit && self._unpublishedBuffer.size() > 0 ? self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId()) : null;
      // The query is unlimited or didn't publish enough documents yet or the
      // new document would fit into published set pushing the maximum element
      // out, then we need to publish the doc.
      var toPublish = !limit || self._published.size() < limit || comparator(doc, maxPublished) < 0;

      // Otherwise we might need to buffer it (only in case of limited query).
      // Buffering is allowed if the buffer is not filled up yet and all
      // matching docs are either in the published set or in the buffer.
      var canAppendToBuffer = !toPublish && self._safeAppendToBuffer && self._unpublishedBuffer.size() < limit;

      // Or if it is small enough to be safely inserted to the middle or the
      // beginning of the buffer.
      var canInsertIntoBuffer = !toPublish && maxBuffered && comparator(doc, maxBuffered) <= 0;
      var toBuffer = canAppendToBuffer || canInsertIntoBuffer;
      if (toPublish) {
        self._addPublished(id, doc);
      } else if (toBuffer) {
        self._addBuffered(id, doc);
      } else {
        // dropping it and not saving to the cache
        self._safeAppendToBuffer = false;
      }
    });
  },
  // Called when a document leaves the "Matching" results set.
  // Takes responsibility of keeping _unpublishedBuffer in sync with _published
  // and the effect of limit enforced.
  _removeMatching: function (id) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      if (!self._published.has(id) && !self._limit) throw Error("tried to remove something matching but not cached " + id);
      if (self._published.has(id)) {
        self._removePublished(id);
      } else if (self._unpublishedBuffer.has(id)) {
        self._removeBuffered(id);
      }
    });
  },
  _handleDoc: function (id, newDoc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var matchesNow = newDoc && self._matcher.documentMatches(newDoc).result;
      var publishedBefore = self._published.has(id);
      var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);
      var cachedBefore = publishedBefore || bufferedBefore;
      if (matchesNow && !cachedBefore) {
        self._addMatching(newDoc);
      } else if (cachedBefore && !matchesNow) {
        self._removeMatching(id);
      } else if (cachedBefore && matchesNow) {
        var oldDoc = self._published.get(id);
        var comparator = self._comparator;
        var minBuffered = self._limit && self._unpublishedBuffer.size() && self._unpublishedBuffer.get(self._unpublishedBuffer.minElementId());
        var maxBuffered;
        if (publishedBefore) {
          // Unlimited case where the document stays in published once it
          // matches or the case when we don't have enough matching docs to
          // publish or the changed but matching doc will stay in published
          // anyways.
          //
          // XXX: We rely on the emptiness of buffer. Be sure to maintain the
          // fact that buffer can't be empty if there are matching documents not
          // published. Notably, we don't want to schedule repoll and continue
          // relying on this property.
          var staysInPublished = !self._limit || self._unpublishedBuffer.size() === 0 || comparator(newDoc, minBuffered) <= 0;
          if (staysInPublished) {
            self._changePublished(id, oldDoc, newDoc);
          } else {
            // after the change doc doesn't stay in the published, remove it
            self._removePublished(id);
            // but it can move into buffered now, check it
            maxBuffered = self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId());
            var toBuffer = self._safeAppendToBuffer || maxBuffered && comparator(newDoc, maxBuffered) <= 0;
            if (toBuffer) {
              self._addBuffered(id, newDoc);
            } else {
              // Throw away from both published set and buffer
              self._safeAppendToBuffer = false;
            }
          }
        } else if (bufferedBefore) {
          oldDoc = self._unpublishedBuffer.get(id);
          // remove the old version manually instead of using _removeBuffered so
          // we don't trigger the querying immediately.  if we end this block
          // with the buffer empty, we will need to trigger the query poll
          // manually too.
          self._unpublishedBuffer.remove(id);
          var maxPublished = self._published.get(self._published.maxElementId());
          maxBuffered = self._unpublishedBuffer.size() && self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId());

          // the buffered doc was updated, it could move to published
          var toPublish = comparator(newDoc, maxPublished) < 0;

          // or stays in buffer even after the change
          var staysInBuffer = !toPublish && self._safeAppendToBuffer || !toPublish && maxBuffered && comparator(newDoc, maxBuffered) <= 0;
          if (toPublish) {
            self._addPublished(id, newDoc);
          } else if (staysInBuffer) {
            // stays in buffer but changes
            self._unpublishedBuffer.set(id, newDoc);
          } else {
            // Throw away from both published set and buffer
            self._safeAppendToBuffer = false;
            // Normally this check would have been done in _removeBuffered but
            // we didn't use it, so we need to do it ourself now.
            if (!self._unpublishedBuffer.size()) {
              self._needToPollQuery();
            }
          }
        } else {
          throw new Error("cachedBefore implies either of publishedBefore or bufferedBefore is true.");
        }
      }
    });
  },
  _fetchModifiedDocuments: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._registerPhaseChange(PHASE.FETCHING);
      // Defer, because nothing called from the oplog entry handler may yield,
      // but fetch() yields.
      Meteor.defer(finishIfNeedToPollQuery(function () {
        while (!self._stopped && !self._needToFetch.empty()) {
          if (self._phase === PHASE.QUERYING) {
            // While fetching, we decided to go into QUERYING mode, and then we
            // saw another oplog entry, so _needToFetch is not empty. But we
            // shouldn't fetch these documents until AFTER the query is done.
            break;
          }

          // Being in steady phase here would be surprising.
          if (self._phase !== PHASE.FETCHING) throw new Error("phase in fetchModifiedDocuments: " + self._phase);
          self._currentlyFetching = self._needToFetch;
          var thisGeneration = ++self._fetchGeneration;
          self._needToFetch = new LocalCollection._IdMap();
          var waiting = 0;
          var fut = new Future();
          // This loop is safe, because _currentlyFetching will not be updated
          // during this loop (in fact, it is never mutated).
          self._currentlyFetching.forEach(function (op, id) {
            waiting++;
            self._mongoHandle._docFetcher.fetch(self._cursorDescription.collectionName, id, op, finishIfNeedToPollQuery(function (err, doc) {
              try {
                if (err) {
                  Meteor._debug("Got exception while fetching documents", err);
                  // If we get an error from the fetcher (eg, trouble
                  // connecting to Mongo), let's just abandon the fetch phase
                  // altogether and fall back to polling. It's not like we're
                  // getting live updates anyway.
                  if (self._phase !== PHASE.QUERYING) {
                    self._needToPollQuery();
                  }
                } else if (!self._stopped && self._phase === PHASE.FETCHING && self._fetchGeneration === thisGeneration) {
                  // We re-check the generation in case we've had an explicit
                  // _pollQuery call (eg, in another fiber) which should
                  // effectively cancel this round of fetches.  (_pollQuery
                  // increments the generation.)
                  self._handleDoc(id, doc);
                }
              } finally {
                waiting--;
                // Because fetch() never calls its callback synchronously,
                // this is safe (ie, we won't call fut.return() before the
                // forEach is done).
                if (waiting === 0) fut.return();
              }
            }));
          });
          fut.wait();
          // Exit now if we've had a _pollQuery call (here or in another fiber).
          if (self._phase === PHASE.QUERYING) return;
          self._currentlyFetching = null;
        }
        // We're done fetching, so we can be steady, unless we've had a
        // _pollQuery call (here or in another fiber).
        if (self._phase !== PHASE.QUERYING) self._beSteady();
      }));
    });
  },
  _beSteady: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._registerPhaseChange(PHASE.STEADY);
      var writes = self._writesToCommitWhenWeReachSteady;
      self._writesToCommitWhenWeReachSteady = [];
      self._multiplexer.onFlush(function () {
        _.each(writes, function (w) {
          w.committed();
        });
      });
    });
  },
  _handleOplogEntryQuerying: function (op) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._needToFetch.set(idForOp(op), op);
    });
  },
  _handleOplogEntrySteadyOrFetching: function (op) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var id = idForOp(op);
      // If we're already fetching this one, or about to, we can't optimize;
      // make sure that we fetch it again if necessary.
      if (self._phase === PHASE.FETCHING && (self._currentlyFetching && self._currentlyFetching.has(id) || self._needToFetch.has(id))) {
        self._needToFetch.set(id, op);
        return;
      }
      if (op.op === 'd') {
        if (self._published.has(id) || self._limit && self._unpublishedBuffer.has(id)) self._removeMatching(id);
      } else if (op.op === 'i') {
        if (self._published.has(id)) throw new Error("insert found for already-existing ID in published");
        if (self._unpublishedBuffer && self._unpublishedBuffer.has(id)) throw new Error("insert found for already-existing ID in buffer");

        // XXX what if selector yields?  for now it can't but later it could
        // have $where
        if (self._matcher.documentMatches(op.o).result) self._addMatching(op.o);
      } else if (op.op === 'u') {
        // we are mapping the new oplog format on mongo 5
        // to what we know better, $set
        op.o = oplogV2V1Converter(op.o);
        // Is this a modifier ($set/$unset, which may require us to poll the
        // database to figure out if the whole document matches the selector) or
        // a replacement (in which case we can just directly re-evaluate the
        // selector)?
        // oplog format has changed on mongodb 5, we have to support both now
        // diff is the format in Mongo 5+ (oplog v2)
        var isReplace = !_.has(op.o, '$set') && !_.has(op.o, 'diff') && !_.has(op.o, '$unset');
        // If this modifier modifies something inside an EJSON custom type (ie,
        // anything with EJSON$), then we can't try to use
        // LocalCollection._modify, since that just mutates the EJSON encoding,
        // not the actual object.
        var canDirectlyModifyDoc = !isReplace && modifierCanBeDirectlyApplied(op.o);
        var publishedBefore = self._published.has(id);
        var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);
        if (isReplace) {
          self._handleDoc(id, _.extend({
            _id: id
          }, op.o));
        } else if ((publishedBefore || bufferedBefore) && canDirectlyModifyDoc) {
          // Oh great, we actually know what the document is, so we can apply
          // this directly.
          var newDoc = self._published.has(id) ? self._published.get(id) : self._unpublishedBuffer.get(id);
          newDoc = EJSON.clone(newDoc);
          newDoc._id = id;
          try {
            LocalCollection._modify(newDoc, op.o);
          } catch (e) {
            if (e.name !== "MinimongoError") throw e;
            // We didn't understand the modifier.  Re-fetch.
            self._needToFetch.set(id, op);
            if (self._phase === PHASE.STEADY) {
              self._fetchModifiedDocuments();
            }
            return;
          }
          self._handleDoc(id, self._sharedProjectionFn(newDoc));
        } else if (!canDirectlyModifyDoc || self._matcher.canBecomeTrueByModifier(op.o) || self._sorter && self._sorter.affectedByModifier(op.o)) {
          self._needToFetch.set(id, op);
          if (self._phase === PHASE.STEADY) self._fetchModifiedDocuments();
        }
      } else {
        throw Error("XXX SURPRISING OPERATION: " + op);
      }
    });
  },
  // Yields!
  _runInitialQuery: function () {
    var self = this;
    if (self._stopped) throw new Error("oplog stopped surprisingly early");
    self._runQuery({
      initial: true
    }); // yields

    if (self._stopped) return; // can happen on queryError

    // Allow observeChanges calls to return. (After this, it's possible for
    // stop() to be called.)
    self._multiplexer.ready();
    self._doneQuerying(); // yields
  },

  // In various circumstances, we may just want to stop processing the oplog and
  // re-run the initial query, just as if we were a PollingObserveDriver.
  //
  // This function may not block, because it is called from an oplog entry
  // handler.
  //
  // XXX We should call this when we detect that we've been in FETCHING for "too
  // long".
  //
  // XXX We should call this when we detect Mongo failover (since that might
  // mean that some of the oplog entries we have processed have been rolled
  // back). The Node Mongo driver is in the middle of a bunch of huge
  // refactorings, including the way that it notifies you when primary
  // changes. Will put off implementing this until driver 1.4 is out.
  _pollQuery: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      if (self._stopped) return;

      // Yay, we get to forget about all the things we thought we had to fetch.
      self._needToFetch = new LocalCollection._IdMap();
      self._currentlyFetching = null;
      ++self._fetchGeneration; // ignore any in-flight fetches
      self._registerPhaseChange(PHASE.QUERYING);

      // Defer so that we don't yield.  We don't need finishIfNeedToPollQuery
      // here because SwitchedToQuery is not thrown in QUERYING mode.
      Meteor.defer(function () {
        self._runQuery();
        self._doneQuerying();
      });
    });
  },
  // Yields!
  _runQuery: function (options) {
    var self = this;
    options = options || {};
    var newResults, newBuffer;

    // This while loop is just to retry failures.
    while (true) {
      // If we've been stopped, we don't have to run anything any more.
      if (self._stopped) return;
      newResults = new LocalCollection._IdMap();
      newBuffer = new LocalCollection._IdMap();

      // Query 2x documents as the half excluded from the original query will go
      // into unpublished buffer to reduce additional Mongo lookups in cases
      // when documents are removed from the published set and need a
      // replacement.
      // XXX needs more thought on non-zero skip
      // XXX 2 is a "magic number" meaning there is an extra chunk of docs for
      // buffer if such is needed.
      var cursor = self._cursorForQuery({
        limit: self._limit * 2
      });
      try {
        cursor.forEach(function (doc, i) {
          // yields
          if (!self._limit || i < self._limit) {
            newResults.set(doc._id, doc);
          } else {
            newBuffer.set(doc._id, doc);
          }
        });
        break;
      } catch (e) {
        if (options.initial && typeof e.code === 'number') {
          // This is an error document sent to us by mongod, not a connection
          // error generated by the client. And we've never seen this query work
          // successfully. Probably it's a bad selector or something, so we
          // should NOT retry. Instead, we should halt the observe (which ends
          // up calling `stop` on us).
          self._multiplexer.queryError(e);
          return;
        }

        // During failover (eg) if we get an exception we should log and retry
        // instead of crashing.
        Meteor._debug("Got exception while polling query", e);
        Meteor._sleepForMs(100);
      }
    }
    if (self._stopped) return;
    self._publishNewResults(newResults, newBuffer);
  },
  // Transitions to QUERYING and runs another query, or (if already in QUERYING)
  // ensures that we will query again later.
  //
  // This function may not block, because it is called from an oplog entry
  // handler. However, if we were not already in the QUERYING phase, it throws
  // an exception that is caught by the closest surrounding
  // finishIfNeedToPollQuery call; this ensures that we don't continue running
  // close that was designed for another phase inside PHASE.QUERYING.
  //
  // (It's also necessary whenever logic in this file yields to check that other
  // phases haven't put us into QUERYING mode, though; eg,
  // _fetchModifiedDocuments does this.)
  _needToPollQuery: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      if (self._stopped) return;

      // If we're not already in the middle of a query, we can query now
      // (possibly pausing FETCHING).
      if (self._phase !== PHASE.QUERYING) {
        self._pollQuery();
        throw new SwitchedToQuery();
      }

      // We're currently in QUERYING. Set a flag to ensure that we run another
      // query when we're done.
      self._requeryWhenDoneThisQuery = true;
    });
  },
  // Yields!
  _doneQuerying: function () {
    var self = this;
    if (self._stopped) return;
    self._mongoHandle._oplogHandle.waitUntilCaughtUp(); // yields
    if (self._stopped) return;
    if (self._phase !== PHASE.QUERYING) throw Error("Phase unexpectedly " + self._phase);
    Meteor._noYieldsAllowed(function () {
      if (self._requeryWhenDoneThisQuery) {
        self._requeryWhenDoneThisQuery = false;
        self._pollQuery();
      } else if (self._needToFetch.empty()) {
        self._beSteady();
      } else {
        self._fetchModifiedDocuments();
      }
    });
  },
  _cursorForQuery: function (optionsOverwrite) {
    var self = this;
    return Meteor._noYieldsAllowed(function () {
      // The query we run is almost the same as the cursor we are observing,
      // with a few changes. We need to read all the fields that are relevant to
      // the selector, not just the fields we are going to publish (that's the
      // "shared" projection). And we don't want to apply any transform in the
      // cursor, because observeChanges shouldn't use the transform.
      var options = _.clone(self._cursorDescription.options);

      // Allow the caller to modify the options. Useful to specify different
      // skip and limit values.
      _.extend(options, optionsOverwrite);
      options.fields = self._sharedProjection;
      delete options.transform;
      // We are NOT deep cloning fields or selector here, which should be OK.
      var description = new CursorDescription(self._cursorDescription.collectionName, self._cursorDescription.selector, options);
      return new Cursor(self._mongoHandle, description);
    });
  },
  // Replace self._published with newResults (both are IdMaps), invoking observe
  // callbacks on the multiplexer.
  // Replace self._unpublishedBuffer with newBuffer.
  //
  // XXX This is very similar to LocalCollection._diffQueryUnorderedChanges. We
  // should really: (a) Unify IdMap and OrderedDict into Unordered/OrderedDict
  // (b) Rewrite diff.js to use these classes instead of arrays and objects.
  _publishNewResults: function (newResults, newBuffer) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      // If the query is limited and there is a buffer, shut down so it doesn't
      // stay in a way.
      if (self._limit) {
        self._unpublishedBuffer.clear();
      }

      // First remove anything that's gone. Be careful not to modify
      // self._published while iterating over it.
      var idsToRemove = [];
      self._published.forEach(function (doc, id) {
        if (!newResults.has(id)) idsToRemove.push(id);
      });
      _.each(idsToRemove, function (id) {
        self._removePublished(id);
      });

      // Now do adds and changes.
      // If self has a buffer and limit, the new fetched result will be
      // limited correctly as the query has sort specifier.
      newResults.forEach(function (doc, id) {
        self._handleDoc(id, doc);
      });

      // Sanity-check that everything we tried to put into _published ended up
      // there.
      // XXX if this is slow, remove it later
      if (self._published.size() !== newResults.size()) {
        Meteor._debug('The Mongo server and the Meteor query disagree on how ' + 'many documents match your query. Cursor description: ', self._cursorDescription);
      }
      self._published.forEach(function (doc, id) {
        if (!newResults.has(id)) throw Error("_published has a doc that newResults doesn't; " + id);
      });

      // Finally, replace the buffer
      newBuffer.forEach(function (doc, id) {
        self._addBuffered(id, doc);
      });
      self._safeAppendToBuffer = newBuffer.size() < self._limit;
    });
  },
  // This stop function is invoked from the onStop of the ObserveMultiplexer, so
  // it shouldn't actually be possible to call it until the multiplexer is
  // ready.
  //
  // It's important to check self._stopped after every call in this file that
  // can yield!
  stop: function () {
    var self = this;
    if (self._stopped) return;
    self._stopped = true;
    _.each(self._stopHandles, function (handle) {
      handle.stop();
    });

    // Note: we *don't* use multiplexer.onFlush here because this stop
    // callback is actually invoked by the multiplexer itself when it has
    // determined that there are no handles left. So nothing is actually going
    // to get flushed (and it's probably not valid to call methods on the
    // dying multiplexer).
    _.each(self._writesToCommitWhenWeReachSteady, function (w) {
      w.committed(); // maybe yields?
    });

    self._writesToCommitWhenWeReachSteady = null;

    // Proactively drop references to potentially big things.
    self._published = null;
    self._unpublishedBuffer = null;
    self._needToFetch = null;
    self._currentlyFetching = null;
    self._oplogEntryHandle = null;
    self._listenersHandle = null;
    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "observe-drivers-oplog", -1);
  },
  _registerPhaseChange: function (phase) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var now = new Date();
      if (self._phase) {
        var timeDiff = now - self._phaseStartTime;
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact("mongo-livedata", "time-spent-in-" + self._phase + "-phase", timeDiff);
      }
      self._phase = phase;
      self._phaseStartTime = now;
    });
  }
});

// Does our oplog tailing code support this cursor? For now, we are being very
// conservative and allowing only simple queries with simple options.
// (This is a "static method".)
OplogObserveDriver.cursorSupported = function (cursorDescription, matcher) {
  // First, check the options.
  var options = cursorDescription.options;

  // Did the user say no explicitly?
  // underscored version of the option is COMPAT with 1.2
  if (options.disableOplog || options._disableOplog) return false;

  // skip is not supported: to support it we would need to keep track of all
  // "skipped" documents or at least their ids.
  // limit w/o a sort specifier is not supported: current implementation needs a
  // deterministic way to order documents.
  if (options.skip || options.limit && !options.sort) return false;

  // If a fields projection option is given check if it is supported by
  // minimongo (some operators are not supported).
  const fields = options.fields || options.projection;
  if (fields) {
    try {
      LocalCollection._checkSupportedProjection(fields);
    } catch (e) {
      if (e.name === "MinimongoError") {
        return false;
      } else {
        throw e;
      }
    }
  }

  // We don't allow the following selectors:
  //   - $where (not confident that we provide the same JS environment
  //             as Mongo, and can yield!)
  //   - $near (has "interesting" properties in MongoDB, like the possibility
  //            of returning an ID multiple times, though even polling maybe
  //            have a bug there)
  //           XXX: once we support it, we would need to think more on how we
  //           initialize the comparators when we create the driver.
  return !matcher.hasWhere() && !matcher.hasGeoQuery();
};
var modifierCanBeDirectlyApplied = function (modifier) {
  return _.all(modifier, function (fields, operation) {
    return _.all(fields, function (value, field) {
      return !/EJSON\$/.test(field);
    });
  });
};
MongoInternals.OplogObserveDriver = OplogObserveDriver;
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"oplog_v2_converter.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/oplog_v2_converter.js                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  oplogV2V1Converter: () => oplogV2V1Converter
});
// Converter of the new MongoDB Oplog format (>=5.0) to the one that Meteor
// handles well, i.e., `$set` and `$unset`. The new format is completely new,
// and looks as follows:
//
//   { $v: 2, diff: Diff }
//
// where `Diff` is a recursive structure:
//
//   {
//     // Nested updates (sometimes also represented with an s-field).
//     // Example: `{ $set: { 'foo.bar': 1 } }`.
//     i: { <key>: <value>, ... },
//
//     // Top-level updates.
//     // Example: `{ $set: { foo: { bar: 1 } } }`.
//     u: { <key>: <value>, ... },
//
//     // Unsets.
//     // Example: `{ $unset: { foo: '' } }`.
//     d: { <key>: false, ... },
//
//     // Array operations.
//     // Example: `{ $push: { foo: 'bar' } }`.
//     s<key>: { a: true, u<index>: <value>, ... },
//     ...
//
//     // Nested operations (sometimes also represented in the `i` field).
//     // Example: `{ $set: { 'foo.bar': 1 } }`.
//     s<key>: Diff,
//     ...
//   }
//
// (all fields are optional).

function join(prefix, key) {
  return prefix ? "".concat(prefix, ".").concat(key) : key;
}
const arrayOperatorKeyRegex = /^(a|[su]\d+)$/;
function isArrayOperatorKey(field) {
  return arrayOperatorKeyRegex.test(field);
}
function isArrayOperator(operator) {
  return operator.a === true && Object.keys(operator).every(isArrayOperatorKey);
}
function flattenObjectInto(target, source, prefix) {
  if (Array.isArray(source) || typeof source !== 'object' || source === null) {
    target[prefix] = source;
  } else {
    const entries = Object.entries(source);
    if (entries.length) {
      entries.forEach(_ref => {
        let [key, value] = _ref;
        flattenObjectInto(target, value, join(prefix, key));
      });
    } else {
      target[prefix] = source;
    }
  }
}
const logDebugMessages = !!process.env.OPLOG_CONVERTER_DEBUG;
function convertOplogDiff(oplogEntry, diff, prefix) {
  if (logDebugMessages) {
    console.log("convertOplogDiff(".concat(JSON.stringify(oplogEntry), ", ").concat(JSON.stringify(diff), ", ").concat(JSON.stringify(prefix), ")"));
  }
  Object.entries(diff).forEach(_ref2 => {
    let [diffKey, value] = _ref2;
    if (diffKey === 'd') {
      var _oplogEntry$$unset;
      // Handle `$unset`s.
      (_oplogEntry$$unset = oplogEntry.$unset) !== null && _oplogEntry$$unset !== void 0 ? _oplogEntry$$unset : oplogEntry.$unset = {};
      Object.keys(value).forEach(key => {
        oplogEntry.$unset[join(prefix, key)] = true;
      });
    } else if (diffKey === 'i') {
      var _oplogEntry$$set;
      // Handle (potentially) nested `$set`s.
      (_oplogEntry$$set = oplogEntry.$set) !== null && _oplogEntry$$set !== void 0 ? _oplogEntry$$set : oplogEntry.$set = {};
      flattenObjectInto(oplogEntry.$set, value, prefix);
    } else if (diffKey === 'u') {
      var _oplogEntry$$set2;
      // Handle flat `$set`s.
      (_oplogEntry$$set2 = oplogEntry.$set) !== null && _oplogEntry$$set2 !== void 0 ? _oplogEntry$$set2 : oplogEntry.$set = {};
      Object.entries(value).forEach(_ref3 => {
        let [key, value] = _ref3;
        oplogEntry.$set[join(prefix, key)] = value;
      });
    } else {
      // Handle s-fields.
      const key = diffKey.slice(1);
      if (isArrayOperator(value)) {
        // Array operator.
        Object.entries(value).forEach(_ref4 => {
          let [position, value] = _ref4;
          if (position === 'a') {
            return;
          }
          const positionKey = join(join(prefix, key), position.slice(1));
          if (position[0] === 's') {
            convertOplogDiff(oplogEntry, value, positionKey);
          } else if (value === null) {
            var _oplogEntry$$unset2;
            (_oplogEntry$$unset2 = oplogEntry.$unset) !== null && _oplogEntry$$unset2 !== void 0 ? _oplogEntry$$unset2 : oplogEntry.$unset = {};
            oplogEntry.$unset[positionKey] = true;
          } else {
            var _oplogEntry$$set3;
            (_oplogEntry$$set3 = oplogEntry.$set) !== null && _oplogEntry$$set3 !== void 0 ? _oplogEntry$$set3 : oplogEntry.$set = {};
            oplogEntry.$set[positionKey] = value;
          }
        });
      } else if (key) {
        // Nested object.
        convertOplogDiff(oplogEntry, value, join(prefix, key));
      }
    }
  });
}
function oplogV2V1Converter(oplogEntry) {
  // Pass-through v1 and (probably) invalid entries.
  if (oplogEntry.$v !== 2 || !oplogEntry.diff) {
    return oplogEntry;
  }
  const convertedOplogEntry = {
    $v: 2
  };
  convertOplogDiff(convertedOplogEntry, oplogEntry.diff, '');
  return convertedOplogEntry;
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"local_collection_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/local_collection_driver.js                                                                           //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
module.export({
  LocalCollectionDriver: () => LocalCollectionDriver
});
const LocalCollectionDriver = new class LocalCollectionDriver {
  constructor() {
    this.noConnCollections = Object.create(null);
  }
  open(name, conn) {
    if (!name) {
      return new LocalCollection();
    }
    if (!conn) {
      return ensureCollection(name, this.noConnCollections);
    }
    if (!conn._mongo_livedata_collections) {
      conn._mongo_livedata_collections = Object.create(null);
    }

    // XXX is there a way to keep track of a connection's collections without
    // dangling it off the connection object?
    return ensureCollection(name, conn._mongo_livedata_collections);
  }
}();
function ensureCollection(name, collections) {
  return name in collections ? collections[name] : collections[name] = new LocalCollection(name);
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"remote_collection_driver.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/remote_collection_driver.js                                                                          //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
let ASYNC_COLLECTION_METHODS, getAsyncMethodName;
module.link("meteor/minimongo/constants", {
  ASYNC_COLLECTION_METHODS(v) {
    ASYNC_COLLECTION_METHODS = v;
  },
  getAsyncMethodName(v) {
    getAsyncMethodName = v;
  }
}, 0);
MongoInternals.RemoteCollectionDriver = function (mongo_url, options) {
  var self = this;
  self.mongo = new MongoConnection(mongo_url, options);
};
const REMOTE_COLLECTION_METHODS = ['_createCappedCollection', '_dropIndex', '_ensureIndex', 'createIndex', 'countDocuments', 'dropCollection', 'estimatedDocumentCount', 'find', 'findOne', 'insert', 'rawCollection', 'remove', 'update', 'upsert'];
Object.assign(MongoInternals.RemoteCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    var ret = {};
    REMOTE_COLLECTION_METHODS.forEach(function (m) {
      ret[m] = _.bind(self.mongo[m], self.mongo, name);
      if (!ASYNC_COLLECTION_METHODS.includes(m)) return;
      const asyncMethodName = getAsyncMethodName(m);
      ret[asyncMethodName] = function () {
        try {
          return Promise.resolve(ret[m](...arguments));
        } catch (error) {
          return Promise.reject(error);
        }
      };
    });
    return ret;
  }
});

// Create the singleton RemoteCollectionDriver only on demand, so we
// only require Mongo configuration if it's actually used (eg, not if
// you're only trying to receive data from a remote DDP server.)
MongoInternals.defaultRemoteCollectionDriver = _.once(function () {
  var connectionOptions = {};
  var mongoUrl = process.env.MONGO_URL;
  if (process.env.MONGO_OPLOG_URL) {
    connectionOptions.oplogUrl = process.env.MONGO_OPLOG_URL;
  }
  if (!mongoUrl) throw new Error("MONGO_URL must be set in environment");
  const driver = new MongoInternals.RemoteCollectionDriver(mongoUrl, connectionOptions);

  // As many deployment tools, including Meteor Up, send requests to the app in
  // order to confirm that the deployment finished successfully, it's required
  // to know about a database connection problem before the app starts. Doing so
  // in a `Meteor.startup` is fine, as the `WebApp` handles requests only after
  // all are finished.
  Meteor.startup(() => {
    Promise.await(driver.mongo.client.connect());
  });
  return driver;
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"collection.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/collection.js                                                                                        //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
!function (module1) {
  let _objectSpread;
  module1.link("@babel/runtime/helpers/objectSpread2", {
    default(v) {
      _objectSpread = v;
    }
  }, 0);
  module1.export({
    warnUsingOldApi: () => warnUsingOldApi
  });
  let ASYNC_COLLECTION_METHODS, getAsyncMethodName;
  module1.link("meteor/minimongo/constants", {
    ASYNC_COLLECTION_METHODS(v) {
      ASYNC_COLLECTION_METHODS = v;
    },
    getAsyncMethodName(v) {
      getAsyncMethodName = v;
    }
  }, 0);
  let normalizeProjection;
  module1.link("./mongo_utils", {
    normalizeProjection(v) {
      normalizeProjection = v;
    }
  }, 1);
  function warnUsingOldApi(methodName, collectionName, isCalledFromAsync) {
    if (process.env.WARN_WHEN_USING_OLD_API &&
    // also ensures it is on the server
    !isCalledFromAsync // must be true otherwise we should log
    ) {
      if (collectionName === undefined || collectionName.includes('oplog')) return;
      console.warn("\n   \n   Calling method ".concat(collectionName, ".").concat(methodName, " from old API on server.\n   This method will be removed, from the server, in version 3.\n   Trace is below:"));
      console.trace();
    }
    ;
  }
  /**
   * @summary Namespace for MongoDB-related items
   * @namespace
   */
  Mongo = {};

  /**
   * @summary Constructor for a Collection
   * @locus Anywhere
   * @instancename collection
   * @class
   * @param {String} name The name of the collection.  If null, creates an unmanaged (unsynchronized) local collection.
   * @param {Object} [options]
   * @param {Object} options.connection The server connection that will manage this collection. Uses the default connection if not specified.  Pass the return value of calling [`DDP.connect`](#ddp_connect) to specify a different server. Pass `null` to specify no connection. Unmanaged (`name` is null) collections cannot specify a connection.
   * @param {String} options.idGeneration The method of generating the `_id` fields of new documents in this collection.  Possible values:
  
   - **`'STRING'`**: random strings
   - **`'MONGO'`**:  random [`Mongo.ObjectID`](#mongo_object_id) values
  
  The default id generation technique is `'STRING'`.
   * @param {Function} options.transform An optional transformation function. Documents will be passed through this function before being returned from `fetch` or `findOne`, and before being passed to callbacks of `observe`, `map`, `forEach`, `allow`, and `deny`. Transforms are *not* applied for the callbacks of `observeChanges` or to cursors returned from publish functions.
   * @param {Boolean} options.defineMutationMethods Set to `false` to skip setting up the mutation methods that enable insert/update/remove from client code. Default `true`.
   */
  Mongo.Collection = function Collection(name, options) {
    if (!name && name !== null) {
      Meteor._debug('Warning: creating anonymous collection. It will not be ' + 'saved or synchronized over the network. (Pass null for ' + 'the collection name to turn off this warning.)');
      name = null;
    }
    if (name !== null && typeof name !== 'string') {
      throw new Error('First argument to new Mongo.Collection must be a string or null');
    }
    if (options && options.methods) {
      // Backwards compatibility hack with original signature (which passed
      // "connection" directly instead of in options. (Connections must have a "methods"
      // method.)
      // XXX remove before 1.0
      options = {
        connection: options
      };
    }
    // Backwards compatibility: "connection" used to be called "manager".
    if (options && options.manager && !options.connection) {
      options.connection = options.manager;
    }
    options = _objectSpread({
      connection: undefined,
      idGeneration: 'STRING',
      transform: null,
      _driver: undefined,
      _preventAutopublish: false
    }, options);
    switch (options.idGeneration) {
      case 'MONGO':
        this._makeNewID = function () {
          var src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
          return new Mongo.ObjectID(src.hexString(24));
        };
        break;
      case 'STRING':
      default:
        this._makeNewID = function () {
          var src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
          return src.id();
        };
        break;
    }
    this._transform = LocalCollection.wrapTransform(options.transform);
    if (!name || options.connection === null)
      // note: nameless collections never have a connection
      this._connection = null;else if (options.connection) this._connection = options.connection;else if (Meteor.isClient) this._connection = Meteor.connection;else this._connection = Meteor.server;
    if (!options._driver) {
      // XXX This check assumes that webapp is loaded so that Meteor.server !==
      // null. We should fully support the case of "want to use a Mongo-backed
      // collection from Node code without webapp", but we don't yet.
      // #MeteorServerNull
      if (name && this._connection === Meteor.server && typeof MongoInternals !== 'undefined' && MongoInternals.defaultRemoteCollectionDriver) {
        options._driver = MongoInternals.defaultRemoteCollectionDriver();
      } else {
        const {
          LocalCollectionDriver
        } = require('./local_collection_driver.js');
        options._driver = LocalCollectionDriver;
      }
    }
    this._collection = options._driver.open(name, this._connection);
    this._name = name;
    this._driver = options._driver;
    this._maybeSetUpReplication(name, options);

    // XXX don't define these until allow or deny is actually used for this
    // collection. Could be hard if the security rules are only defined on the
    // server.
    if (options.defineMutationMethods !== false) {
      try {
        this._defineMutationMethods({
          useExisting: options._suppressSameNameError === true
        });
      } catch (error) {
        // Throw a more understandable error on the server for same collection name
        if (error.message === "A method named '/".concat(name, "/insert' is already defined")) throw new Error("There is already a collection named \"".concat(name, "\""));
        throw error;
      }
    }

    // autopublish
    if (Package.autopublish && !options._preventAutopublish && this._connection && this._connection.publish) {
      this._connection.publish(null, () => this.find(), {
        is_auto: true
      });
    }
  };
  Object.assign(Mongo.Collection.prototype, {
    _maybeSetUpReplication(name, _ref2) {
      let {
        _suppressSameNameError = false
      } = _ref2;
      const self = this;
      if (!(self._connection && self._connection.registerStore)) {
        return;
      }

      // OK, we're going to be a slave, replicating some remote
      // database, except possibly with some temporary divergence while
      // we have unacknowledged RPC's.
      const ok = self._connection.registerStore(name, {
        // Called at the beginning of a batch of updates. batchSize is the number
        // of update calls to expect.
        //
        // XXX This interface is pretty janky. reset probably ought to go back to
        // being its own function, and callers shouldn't have to calculate
        // batchSize. The optimization of not calling pause/remove should be
        // delayed until later: the first call to update() should buffer its
        // message, and then we can either directly apply it at endUpdate time if
        // it was the only update, or do pauseObservers/apply/apply at the next
        // update() if there's another one.
        beginUpdate(batchSize, reset) {
          // pause observers so users don't see flicker when updating several
          // objects at once (including the post-reconnect reset-and-reapply
          // stage), and so that a re-sorting of a query can take advantage of the
          // full _diffQuery moved calculation instead of applying change one at a
          // time.
          if (batchSize > 1 || reset) self._collection.pauseObservers();
          if (reset) self._collection.remove({});
        },
        // Apply an update.
        // XXX better specify this interface (not in terms of a wire message)?
        update(msg) {
          var mongoId = MongoID.idParse(msg.id);
          var doc = self._collection._docs.get(mongoId);

          //When the server's mergebox is disabled for a collection, the client must gracefully handle it when:
          // *We receive an added message for a document that is already there. Instead, it will be changed
          // *We reeive a change message for a document that is not there. Instead, it will be added
          // *We receive a removed messsage for a document that is not there. Instead, noting wil happen.

          //Code is derived from client-side code originally in peerlibrary:control-mergebox
          //https://github.com/peerlibrary/meteor-control-mergebox/blob/master/client.coffee

          //For more information, refer to discussion "Initial support for publication strategies in livedata server":
          //https://github.com/meteor/meteor/pull/11151
          if (Meteor.isClient) {
            if (msg.msg === 'added' && doc) {
              msg.msg = 'changed';
            } else if (msg.msg === 'removed' && !doc) {
              return;
            } else if (msg.msg === 'changed' && !doc) {
              msg.msg = 'added';
              _ref = msg.fields;
              for (field in _ref) {
                value = _ref[field];
                if (value === void 0) {
                  delete msg.fields[field];
                }
              }
            }
          }

          // Is this a "replace the whole doc" message coming from the quiescence
          // of method writes to an object? (Note that 'undefined' is a valid
          // value meaning "remove it".)
          if (msg.msg === 'replace') {
            var replace = msg.replace;
            if (!replace) {
              if (doc) self._collection.remove(mongoId);
            } else if (!doc) {
              self._collection.insert(replace);
            } else {
              // XXX check that replace has no $ ops
              self._collection.update(mongoId, replace);
            }
            return;
          } else if (msg.msg === 'added') {
            if (doc) {
              throw new Error('Expected not to find a document already present for an add');
            }
            self._collection.insert(_objectSpread({
              _id: mongoId
            }, msg.fields));
          } else if (msg.msg === 'removed') {
            if (!doc) throw new Error('Expected to find a document already present for removed');
            self._collection.remove(mongoId);
          } else if (msg.msg === 'changed') {
            if (!doc) throw new Error('Expected to find a document to change');
            const keys = Object.keys(msg.fields);
            if (keys.length > 0) {
              var modifier = {};
              keys.forEach(key => {
                const value = msg.fields[key];
                if (EJSON.equals(doc[key], value)) {
                  return;
                }
                if (typeof value === 'undefined') {
                  if (!modifier.$unset) {
                    modifier.$unset = {};
                  }
                  modifier.$unset[key] = 1;
                } else {
                  if (!modifier.$set) {
                    modifier.$set = {};
                  }
                  modifier.$set[key] = value;
                }
              });
              if (Object.keys(modifier).length > 0) {
                self._collection.update(mongoId, modifier);
              }
            }
          } else {
            throw new Error("I don't know how to deal with this message");
          }
        },
        // Called at the end of a batch of updates.
        endUpdate() {
          self._collection.resumeObservers();
        },
        // Called around method stub invocations to capture the original versions
        // of modified documents.
        saveOriginals() {
          self._collection.saveOriginals();
        },
        retrieveOriginals() {
          return self._collection.retrieveOriginals();
        },
        // Used to preserve current versions of documents across a store reset.
        getDoc(id) {
          return self.findOne(id);
        },
        // To be able to get back to the collection from the store.
        _getCollection() {
          return self;
        }
      });
      if (!ok) {
        const message = "There is already a collection named \"".concat(name, "\"");
        if (_suppressSameNameError === true) {
          // XXX In theory we do not have to throw when `ok` is falsy. The
          // store is already defined for this collection name, but this
          // will simply be another reference to it and everything should
          // work. However, we have historically thrown an error here, so
          // for now we will skip the error only when _suppressSameNameError
          // is `true`, allowing people to opt in and give this some real
          // world testing.
          console.warn ? console.warn(message) : console.log(message);
        } else {
          throw new Error(message);
        }
      }
    },
    ///
    /// Main collection API
    ///
    /**
     * @summary Gets the number of documents matching the filter. For a fast count of the total documents in a collection see `estimatedDocumentCount`.
     * @locus Anywhere
     * @method countDocuments
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} [selector] A query describing the documents to count
     * @param {Object} [options] All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/CountDocumentsOptions.html). Please note that not all of them are available on the client.
     * @returns {Promise<number>}
     */
    countDocuments() {
      return this._collection.countDocuments(...arguments);
    },
    /**
     * @summary Gets an estimate of the count of documents in a collection using collection metadata. For an exact count of the documents in a collection see `countDocuments`.
     * @locus Anywhere
     * @method estimatedDocumentCount
     * @memberof Mongo.Collection
     * @instance
     * @param {Object} [options] All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/EstimatedDocumentCountOptions.html). Please note that not all of them are available on the client.
     * @returns {Promise<number>}
     */
    estimatedDocumentCount() {
      return this._collection.estimatedDocumentCount(...arguments);
    },
    _getFindSelector(args) {
      if (args.length == 0) return {};else return args[0];
    },
    _getFindOptions(args) {
      const [, options] = args || [];
      const newOptions = normalizeProjection(options);
      var self = this;
      if (args.length < 2) {
        return {
          transform: self._transform
        };
      } else {
        check(newOptions, Match.Optional(Match.ObjectIncluding({
          projection: Match.Optional(Match.OneOf(Object, undefined)),
          sort: Match.Optional(Match.OneOf(Object, Array, Function, undefined)),
          limit: Match.Optional(Match.OneOf(Number, undefined)),
          skip: Match.Optional(Match.OneOf(Number, undefined))
        })));
        return _objectSpread({
          transform: self._transform
        }, newOptions);
      }
    },
    /**
     * @summary Find the documents in a collection that match the selector.
     * @locus Anywhere
     * @method find
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} [selector] A query describing the documents to find
     * @param {Object} [options]
     * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)
     * @param {Number} options.skip Number of results to skip at the beginning
     * @param {Number} options.limit Maximum number of results to return
     * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
     * @param {Boolean} options.reactive (Client only) Default `true`; pass `false` to disable reactivity
     * @param {Function} options.transform Overrides `transform` on the  [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
     * @param {Boolean} options.disableOplog (Server only) Pass true to disable oplog-tailing on this query. This affects the way server processes calls to `observe` on this query. Disabling the oplog can be useful when working with data that updates in large batches.
     * @param {Number} options.pollingIntervalMs (Server only) When oplog is disabled (through the use of `disableOplog` or when otherwise not available), the frequency (in milliseconds) of how often to poll this query when observing on the server. Defaults to 10000ms (10 seconds).
     * @param {Number} options.pollingThrottleMs (Server only) When oplog is disabled (through the use of `disableOplog` or when otherwise not available), the minimum time (in milliseconds) to allow between re-polling when observing on the server. Increasing this will save CPU and mongo load at the expense of slower updates to users. Decreasing this is not recommended. Defaults to 50ms.
     * @param {Number} options.maxTimeMs (Server only) If set, instructs MongoDB to set a time limit for this cursor's operations. If the operation reaches the specified time limit (in milliseconds) without the having been completed, an exception will be thrown. Useful to prevent an (accidental or malicious) unoptimized query from causing a full collection scan that would disrupt other database users, at the expense of needing to handle the resulting error.
     * @param {String|Object} options.hint (Server only) Overrides MongoDB's default index selection and query optimization process. Specify an index to force its use, either by its name or index specification. You can also specify `{ $natural : 1 }` to force a forwards collection scan, or `{ $natural : -1 }` for a reverse collection scan. Setting this is only recommended for advanced users.
     * @param {String} options.readPreference (Server only) Specifies a custom MongoDB [`readPreference`](https://docs.mongodb.com/manual/core/read-preference) for this particular cursor. Possible values are `primary`, `primaryPreferred`, `secondary`, `secondaryPreferred` and `nearest`.
     * @returns {Mongo.Cursor}
     */
    find() {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      // Collection.find() (return all docs) behaves differently
      // from Collection.find(undefined) (return 0 docs).  so be
      // careful about the length of arguments.
      return this._collection.find(this._getFindSelector(args), this._getFindOptions(args));
    },
    /**
     * @summary Finds the first document that matches the selector, as ordered by sort and skip options. Returns `undefined` if no matching document is found.
     * @locus Anywhere
     * @method findOne
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} [selector] A query describing the documents to find
     * @param {Object} [options]
     * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)
     * @param {Number} options.skip Number of results to skip at the beginning
     * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
     * @param {Boolean} options.reactive (Client only) Default true; pass false to disable reactivity
     * @param {Function} options.transform Overrides `transform` on the [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
     * @param {String} options.readPreference (Server only) Specifies a custom MongoDB [`readPreference`](https://docs.mongodb.com/manual/core/read-preference) for fetching the document. Possible values are `primary`, `primaryPreferred`, `secondary`, `secondaryPreferred` and `nearest`.
     * @returns {Object}
     */
    findOne() {
      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("findOne", this._name, this.findOne.isCalledFromAsync);
      this.findOne.isCalledFromAsync = false;
      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }
      return this._collection.findOne(this._getFindSelector(args), this._getFindOptions(args));
    }
  });
  Object.assign(Mongo.Collection, {
    _publishCursor(cursor, sub, collection) {
      var observeHandle = cursor.observeChanges({
        added: function (id, fields) {
          sub.added(collection, id, fields);
        },
        changed: function (id, fields) {
          sub.changed(collection, id, fields);
        },
        removed: function (id) {
          sub.removed(collection, id);
        }
      },
      // Publications don't mutate the documents
      // This is tested by the `livedata - publish callbacks clone` test
      {
        nonMutatingCallbacks: true
      });

      // We don't call sub.ready() here: it gets called in livedata_server, after
      // possibly calling _publishCursor on multiple returned cursors.

      // register stop callback (expects lambda w/ no args).
      sub.onStop(function () {
        observeHandle.stop();
      });

      // return the observeHandle in case it needs to be stopped early
      return observeHandle;
    },
    // protect against dangerous selectors.  falsey and {_id: falsey} are both
    // likely programmer error, and not what you want, particularly for destructive
    // operations. If a falsey _id is sent in, a new string _id will be
    // generated and returned; if a fallbackId is provided, it will be returned
    // instead.
    _rewriteSelector(selector) {
      let {
        fallbackId
      } = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      // shorthand -- scalars match _id
      if (LocalCollection._selectorIsId(selector)) selector = {
        _id: selector
      };
      if (Array.isArray(selector)) {
        // This is consistent with the Mongo console itself; if we don't do this
        // check passing an empty array ends up selecting all items
        throw new Error("Mongo selector can't be an array.");
      }
      if (!selector || '_id' in selector && !selector._id) {
        // can't match anything
        return {
          _id: fallbackId || Random.id()
        };
      }
      return selector;
    }
  });
  Object.assign(Mongo.Collection.prototype, {
    // 'insert' immediately returns the inserted document's new _id.
    // The others return values immediately if you are in a stub, an in-memory
    // unmanaged collection, or a mongo-backed collection and you don't pass a
    // callback. 'update' and 'remove' return the number of affected
    // documents. 'upsert' returns an object with keys 'numberAffected' and, if an
    // insert happened, 'insertedId'.
    //
    // Otherwise, the semantics are exactly like other methods: they take
    // a callback as an optional last argument; if no callback is
    // provided, they block until the operation is complete, and throw an
    // exception if it fails; if a callback is provided, then they don't
    // necessarily block, and they call the callback when they finish with error and
    // result arguments.  (The insert method provides the document ID as its result;
    // update and remove provide the number of affected docs as the result; upsert
    // provides an object with numberAffected and maybe insertedId.)
    //
    // On the client, blocking is impossible, so if a callback
    // isn't provided, they just return immediately and any error
    // information is lost.
    //
    // There's one more tweak. On the client, if you don't provide a
    // callback, then if there is an error, a message will be logged with
    // Meteor._debug.
    //
    // The intent (though this is actually determined by the underlying
    // drivers) is that the operations should be done synchronously, not
    // generating their result until the database has acknowledged
    // them. In the future maybe we should provide a flag to turn this
    // off.

    /**
     * @summary Insert a document in the collection.  Returns its unique _id.
     * @locus Anywhere
     * @method  insert
     * @memberof Mongo.Collection
     * @instance
     * @param {Object} doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
     * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the _id as the second.
     */
    insert(doc, callback) {
      // Make sure we were passed a document to insert
      if (!doc) {
        throw new Error('insert requires an argument');
      }

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("insert", this._name, this.insert.isCalledFromAsync);
      this.insert.isCalledFromAsync = false;

      // Make a shallow clone of the document, preserving its prototype.
      doc = Object.create(Object.getPrototypeOf(doc), Object.getOwnPropertyDescriptors(doc));
      if ('_id' in doc) {
        if (!doc._id || !(typeof doc._id === 'string' || doc._id instanceof Mongo.ObjectID)) {
          throw new Error('Meteor requires document _id fields to be non-empty strings or ObjectIDs');
        }
      } else {
        let generateId = true;

        // Don't generate the id if we're the client and the 'outermost' call
        // This optimization saves us passing both the randomSeed and the id
        // Passing both is redundant.
        if (this._isRemoteCollection()) {
          const enclosing = DDP._CurrentMethodInvocation.get();
          if (!enclosing) {
            generateId = false;
          }
        }
        if (generateId) {
          doc._id = this._makeNewID();
        }
      }

      // On inserts, always return the id that we generated; on all other
      // operations, just return the result from the collection.
      var chooseReturnValueFromCollectionResult = function (result) {
        if (doc._id) {
          return doc._id;
        }

        // XXX what is this for??
        // It's some iteraction between the callback to _callMutatorMethod and
        // the return value conversion
        doc._id = result;
        return result;
      };
      const wrappedCallback = wrapCallback(callback, chooseReturnValueFromCollectionResult);
      if (this._isRemoteCollection()) {
        const result = this._callMutatorMethod('insert', [doc], wrappedCallback);
        return chooseReturnValueFromCollectionResult(result);
      }

      // it's my collection.  descend into the collection object
      // and propagate any exception.
      try {
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.
        const result = this._collection.insert(doc, wrappedCallback);
        return chooseReturnValueFromCollectionResult(result);
      } catch (e) {
        if (callback) {
          callback(e);
          return null;
        }
        throw e;
      }
    },
    /**
     * @summary Modify one or more documents in the collection. Returns the number of matched documents.
     * @locus Anywhere
     * @method update
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} selector Specifies which documents to modify
     * @param {MongoModifier} modifier Specifies how to modify the documents
     * @param {Object} [options]
     * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
     * @param {Boolean} options.upsert True to insert a document if no matching documents are found.
     * @param {Array} options.arrayFilters Optional. Used in combination with MongoDB [filtered positional operator](https://docs.mongodb.com/manual/reference/operator/update/positional-filtered/) to specify which elements to modify in an array field.
     * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
     */
    update(selector, modifier) {
      for (var _len3 = arguments.length, optionsAndCallback = new Array(_len3 > 2 ? _len3 - 2 : 0), _key3 = 2; _key3 < _len3; _key3++) {
        optionsAndCallback[_key3 - 2] = arguments[_key3];
      }
      const callback = popCallbackFromArgs(optionsAndCallback);

      // We've already popped off the callback, so we are left with an array
      // of one or zero items
      const options = _objectSpread({}, optionsAndCallback[0] || null);
      let insertedId;
      if (options && options.upsert) {
        // set `insertedId` if absent.  `insertedId` is a Meteor extension.
        if (options.insertedId) {
          if (!(typeof options.insertedId === 'string' || options.insertedId instanceof Mongo.ObjectID)) throw new Error('insertedId must be string or ObjectID');
          insertedId = options.insertedId;
        } else if (!selector || !selector._id) {
          insertedId = this._makeNewID();
          options.generatedId = true;
          options.insertedId = insertedId;
        }
      }

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("update", this._name, this.update.isCalledFromAsync);
      this.update.isCalledFromAsync = false;
      selector = Mongo.Collection._rewriteSelector(selector, {
        fallbackId: insertedId
      });
      const wrappedCallback = wrapCallback(callback);
      if (this._isRemoteCollection()) {
        const args = [selector, modifier, options];
        return this._callMutatorMethod('update', args, wrappedCallback);
      }

      // it's my collection.  descend into the collection object
      // and propagate any exception.
      try {
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.
        return this._collection.update(selector, modifier, options, wrappedCallback);
      } catch (e) {
        if (callback) {
          callback(e);
          return null;
        }
        throw e;
      }
    },
    /**
     * @summary Remove documents from the collection
     * @locus Anywhere
     * @method remove
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} selector Specifies which documents to remove
     * @param {Function} [callback] Optional.  If present, called with an error object as its argument.
     */
    remove(selector, callback) {
      selector = Mongo.Collection._rewriteSelector(selector);
      const wrappedCallback = wrapCallback(callback);
      if (this._isRemoteCollection()) {
        return this._callMutatorMethod('remove', [selector], wrappedCallback);
      }

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("remove", this._name, this.remove.isCalledFromAsync);
      this.remove.isCalledFromAsync = false;
      // it's my collection.  descend into the collection object
      // and propagate any exception.
      try {
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.
        return this._collection.remove(selector, wrappedCallback);
      } catch (e) {
        if (callback) {
          callback(e);
          return null;
        }
        throw e;
      }
    },
    // Determine if this collection is simply a minimongo representation of a real
    // database on another server
    _isRemoteCollection() {
      // XXX see #MeteorServerNull
      return this._connection && this._connection !== Meteor.server;
    },
    /**
     * @summary Modify one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified)  and `insertedId` (the unique _id of the document that was inserted, if any).
     * @locus Anywhere
     * @method upsert
     * @memberof Mongo.Collection
     * @instance
     * @param {MongoSelector} selector Specifies which documents to modify
     * @param {MongoModifier} modifier Specifies how to modify the documents
     * @param {Object} [options]
     * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
     * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
     */
    upsert(selector, modifier, options, callback) {
      if (!callback && typeof options === 'function') {
        callback = options;
        options = {};
      }

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("upsert", this._name, this.upsert.isCalledFromAsync);
      this.upsert.isCalledFromAsync = false; // will not trigger warning in `update`

      return this.update(selector, modifier, _objectSpread(_objectSpread({}, options), {}, {
        _returnObject: true,
        upsert: true
      }), callback);
    },
    // We'll actually design an index API later. For now, we just pass through to
    // Mongo's, but make it synchronous.
    _ensureIndex(index, options) {
      var self = this;
      if (!self._collection._ensureIndex || !self._collection.createIndex) throw new Error('Can only call createIndex on server collections');
      if (self._collection.createIndex) {
        self._collection.createIndex(index, options);
      } else {
        let Log;
        module1.link("meteor/logging", {
          Log(v) {
            Log = v;
          }
        }, 2);
        Log.debug("_ensureIndex has been deprecated, please use the new 'createIndex' instead".concat(options !== null && options !== void 0 && options.name ? ", index name: ".concat(options.name) : ", index: ".concat(JSON.stringify(index))));
        self._collection._ensureIndex(index, options);
      }
    },
    /**
     * @summary Creates the specified index on the collection.
     * @locus server
     * @method createIndex
     * @memberof Mongo.Collection
     * @instance
     * @param {Object} index A document that contains the field and value pairs where the field is the index key and the value describes the type of index for that field. For an ascending index on a field, specify a value of `1`; for descending index, specify a value of `-1`. Use `text` for text indexes.
     * @param {Object} [options] All options are listed in [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/#options)
     * @param {String} options.name Name of the index
     * @param {Boolean} options.unique Define that the index values must be unique, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-unique/)
     * @param {Boolean} options.sparse Define that the index is sparse, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-sparse/)
     */
    createIndex(index, options) {
      var self = this;
      if (!self._collection.createIndex) throw new Error('Can only call createIndex on server collections');
      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("createIndex", self._name, self.createIndex.isCalledFromAsync);
      self.createIndex.isCalledFromAsync = false;
      try {
        self._collection.createIndex(index, options);
      } catch (e) {
        var _Meteor$settings, _Meteor$settings$pack, _Meteor$settings$pack2;
        if (e.message.includes('An equivalent index already exists with the same name but different options.') && (_Meteor$settings = Meteor.settings) !== null && _Meteor$settings !== void 0 && (_Meteor$settings$pack = _Meteor$settings.packages) !== null && _Meteor$settings$pack !== void 0 && (_Meteor$settings$pack2 = _Meteor$settings$pack.mongo) !== null && _Meteor$settings$pack2 !== void 0 && _Meteor$settings$pack2.reCreateIndexOnOptionMismatch) {
          let Log;
          module1.link("meteor/logging", {
            Log(v) {
              Log = v;
            }
          }, 3);
          Log.info("Re-creating index ".concat(index, " for ").concat(self._name, " due to options mismatch."));
          self._collection._dropIndex(index);
          self._collection.createIndex(index, options);
        } else {
          throw new Meteor.Error("An error occurred when creating an index for collection \"".concat(self._name, ": ").concat(e.message));
        }
      }
    },
    _dropIndex(index) {
      var self = this;
      if (!self._collection._dropIndex) throw new Error('Can only call _dropIndex on server collections');
      self._collection._dropIndex(index);
    },
    _dropCollection() {
      var self = this;
      if (!self._collection.dropCollection) throw new Error('Can only call _dropCollection on server collections');
      self._collection.dropCollection();
    },
    _createCappedCollection(byteSize, maxDocuments) {
      var self = this;
      if (!self._collection._createCappedCollection) throw new Error('Can only call _createCappedCollection on server collections');

      // [FIBERS]
      // TODO: Remove this when 3.0 is released.
      warnUsingOldApi("_createCappedCollection", self._name, self._createCappedCollection.isCalledFromAsync);
      self._createCappedCollection.isCalledFromAsync = false;
      self._collection._createCappedCollection(byteSize, maxDocuments);
    },
    /**
     * @summary Returns the [`Collection`](http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html) object corresponding to this collection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
     * @locus Server
     * @memberof Mongo.Collection
     * @instance
     */
    rawCollection() {
      var self = this;
      if (!self._collection.rawCollection) {
        throw new Error('Can only call rawCollection on server collections');
      }
      return self._collection.rawCollection();
    },
    /**
     * @summary Returns the [`Db`](http://mongodb.github.io/node-mongodb-native/3.0/api/Db.html) object corresponding to this collection's database connection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
     * @locus Server
     * @memberof Mongo.Collection
     * @instance
     */
    rawDatabase() {
      var self = this;
      if (!(self._driver.mongo && self._driver.mongo.db)) {
        throw new Error('Can only call rawDatabase on server collections');
      }
      return self._driver.mongo.db;
    }
  });

  // Convert the callback to not return a result if there is an error
  function wrapCallback(callback, convertResult) {
    return callback && function (error, result) {
      if (error) {
        callback(error);
      } else if (typeof convertResult === 'function') {
        callback(error, convertResult(result));
      } else {
        callback(error, result);
      }
    };
  }

  /**
   * @summary Create a Mongo-style `ObjectID`.  If you don't specify a `hexString`, the `ObjectID` will generated randomly (not using MongoDB's ID construction rules).
   * @locus Anywhere
   * @class
   * @param {String} [hexString] Optional.  The 24-character hexadecimal contents of the ObjectID to create
   */
  Mongo.ObjectID = MongoID.ObjectID;

  /**
   * @summary To create a cursor, use find. To access the documents in a cursor, use forEach, map, or fetch.
   * @class
   * @instanceName cursor
   */
  Mongo.Cursor = LocalCollection.Cursor;

  /**
   * @deprecated in 0.9.1
   */
  Mongo.Collection.Cursor = Mongo.Cursor;

  /**
   * @deprecated in 0.9.1
   */
  Mongo.Collection.ObjectID = Mongo.ObjectID;

  /**
   * @deprecated in 0.9.1
   */
  Meteor.Collection = Mongo.Collection;

  // Allow deny stuff is now in the allow-deny package
  Object.assign(Meteor.Collection.prototype, AllowDeny.CollectionPrototype);
  function popCallbackFromArgs(args) {
    // Pull off any callback (or perhaps a 'callback' variable that was passed
    // in undefined, like how 'upsert' does it).
    if (args.length && (args[args.length - 1] === undefined || args[args.length - 1] instanceof Function)) {
      return args.pop();
    }
  }
  ASYNC_COLLECTION_METHODS.forEach(methodName => {
    const methodNameAsync = getAsyncMethodName(methodName);
    Mongo.Collection.prototype[methodNameAsync] = function () {
      try {
        // TODO: Fibers remove this when we remove fibers.
        this[methodName].isCalledFromAsync = true;
        return Promise.resolve(this[methodName](...arguments));
      } catch (error) {
        return Promise.reject(error);
      }
    };
  });
}.call(this, module);
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"connection_options.js":function module(){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/connection_options.js                                                                                //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
/**
 * @summary Allows for user specified connection options
 * @example http://mongodb.github.io/node-mongodb-native/3.0/reference/connecting/connection-settings/
 * @locus Server
 * @param {Object} options User specified Mongo connection options
 */
Mongo.setConnectionOptions = function setConnectionOptions(options) {
  check(options, Object);
  Mongo._connectionOptions = options;
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"mongo_utils.js":function module(require,exports,module){

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                     //
// packages/mongo/mongo_utils.js                                                                                       //
//                                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                       //
const _excluded = ["fields", "projection"];
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
let _objectWithoutProperties;
module.link("@babel/runtime/helpers/objectWithoutProperties", {
  default(v) {
    _objectWithoutProperties = v;
  }
}, 1);
module.export({
  normalizeProjection: () => normalizeProjection
});
const normalizeProjection = options => {
  // transform fields key in projection
  const _ref = options || {},
    {
      fields,
      projection
    } = _ref,
    otherOptions = _objectWithoutProperties(_ref, _excluded);
  // TODO: enable this comment when deprecating the fields option
  // Log.debug(`fields option has been deprecated, please use the new 'projection' instead`)

  return _objectSpread(_objectSpread({}, otherOptions), projection || fields ? {
    projection: fields || projection
  } : {});
};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

require("/node_modules/meteor/mongo/mongo_driver.js");
require("/node_modules/meteor/mongo/oplog_tailing.js");
require("/node_modules/meteor/mongo/observe_multiplex.js");
require("/node_modules/meteor/mongo/doc_fetcher.js");
require("/node_modules/meteor/mongo/polling_observe_driver.js");
require("/node_modules/meteor/mongo/oplog_observe_driver.js");
require("/node_modules/meteor/mongo/oplog_v2_converter.js");
require("/node_modules/meteor/mongo/local_collection_driver.js");
require("/node_modules/meteor/mongo/remote_collection_driver.js");
require("/node_modules/meteor/mongo/collection.js");
require("/node_modules/meteor/mongo/connection_options.js");

/* Exports */
Package._define("mongo", {
  MongoInternals: MongoInternals,
  Mongo: Mongo,
  ObserveMultiplexer: ObserveMultiplexer
});

})();

//# sourceURL=meteor://💻app/packages/mongo.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vbW9uZ29fZHJpdmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vcGxvZ190YWlsaW5nLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vYnNlcnZlX211bHRpcGxleC5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vZG9jX2ZldGNoZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL3BvbGxpbmdfb2JzZXJ2ZV9kcml2ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL29wbG9nX29ic2VydmVfZHJpdmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9vcGxvZ192Ml9jb252ZXJ0ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2xvY2FsX2NvbGxlY3Rpb25fZHJpdmVyLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9tb25nby9yZW1vdGVfY29sbGVjdGlvbl9kcml2ZXIuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2NvbGxlY3Rpb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL21vbmdvL2Nvbm5lY3Rpb25fb3B0aW9ucy5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvbW9uZ28vbW9uZ29fdXRpbHMuanMiXSwibmFtZXMiOlsiX29iamVjdFNwcmVhZCIsIm1vZHVsZTEiLCJsaW5rIiwiZGVmYXVsdCIsInYiLCJub3JtYWxpemVQcm9qZWN0aW9uIiwiRG9jRmV0Y2hlciIsIkFTWU5DX0NVUlNPUl9NRVRIT0RTIiwiZ2V0QXN5bmNNZXRob2ROYW1lIiwicGF0aCIsInJlcXVpcmUiLCJ1dGlsIiwiTW9uZ29EQiIsIk5wbU1vZHVsZU1vbmdvZGIiLCJGdXR1cmUiLCJOcG0iLCJNb25nb0ludGVybmFscyIsIk5wbU1vZHVsZXMiLCJtb25nb2RiIiwidmVyc2lvbiIsIk5wbU1vZHVsZU1vbmdvZGJWZXJzaW9uIiwibW9kdWxlIiwiTnBtTW9kdWxlIiwiRklMRV9BU1NFVF9TVUZGSVgiLCJBU1NFVFNfRk9MREVSIiwiQVBQX0ZPTERFUiIsInJlcGxhY2VOYW1lcyIsImZpbHRlciIsInRoaW5nIiwiXyIsImlzQXJyYXkiLCJtYXAiLCJiaW5kIiwicmV0IiwiZWFjaCIsInZhbHVlIiwia2V5IiwiVGltZXN0YW1wIiwicHJvdG90eXBlIiwiY2xvbmUiLCJtYWtlTW9uZ29MZWdhbCIsIm5hbWUiLCJ1bm1ha2VNb25nb0xlZ2FsIiwic3Vic3RyIiwicmVwbGFjZU1vbmdvQXRvbVdpdGhNZXRlb3IiLCJkb2N1bWVudCIsIkJpbmFyeSIsInN1Yl90eXBlIiwiYnVmZmVyIiwiVWludDhBcnJheSIsIk9iamVjdElEIiwiTW9uZ28iLCJ0b0hleFN0cmluZyIsIkRlY2ltYWwxMjgiLCJEZWNpbWFsIiwidG9TdHJpbmciLCJzaXplIiwiRUpTT04iLCJmcm9tSlNPTlZhbHVlIiwidW5kZWZpbmVkIiwicmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28iLCJpc0JpbmFyeSIsIkJ1ZmZlciIsImZyb20iLCJmcm9tU3RyaW5nIiwiX2lzQ3VzdG9tVHlwZSIsInRvSlNPTlZhbHVlIiwicmVwbGFjZVR5cGVzIiwiYXRvbVRyYW5zZm9ybWVyIiwicmVwbGFjZWRUb3BMZXZlbEF0b20iLCJ2YWwiLCJ2YWxSZXBsYWNlZCIsIk1vbmdvQ29ubmVjdGlvbiIsInVybCIsIm9wdGlvbnMiLCJzZWxmIiwiX29ic2VydmVNdWx0aXBsZXhlcnMiLCJfb25GYWlsb3Zlckhvb2siLCJIb29rIiwidXNlck9wdGlvbnMiLCJfY29ubmVjdGlvbk9wdGlvbnMiLCJNZXRlb3IiLCJzZXR0aW5ncyIsInBhY2thZ2VzIiwibW9uZ28iLCJtb25nb09wdGlvbnMiLCJPYmplY3QiLCJhc3NpZ24iLCJpZ25vcmVVbmRlZmluZWQiLCJoYXMiLCJtYXhQb29sU2l6ZSIsImVudHJpZXMiLCJlbmRzV2l0aCIsImZvckVhY2giLCJvcHRpb25OYW1lIiwicmVwbGFjZSIsImpvaW4iLCJBc3NldHMiLCJnZXRTZXJ2ZXJEaXIiLCJkYiIsIl9vcGxvZ0hhbmRsZSIsIl9kb2NGZXRjaGVyIiwiY2xpZW50IiwiTW9uZ29DbGllbnQiLCJvbiIsImJpbmRFbnZpcm9ubWVudCIsImV2ZW50IiwicHJldmlvdXNEZXNjcmlwdGlvbiIsInR5cGUiLCJuZXdEZXNjcmlwdGlvbiIsImNhbGxiYWNrIiwib3Bsb2dVcmwiLCJQYWNrYWdlIiwiT3Bsb2dIYW5kbGUiLCJkYXRhYmFzZU5hbWUiLCJjbG9zZSIsIkVycm9yIiwib3Bsb2dIYW5kbGUiLCJzdG9wIiwid3JhcCIsIndhaXQiLCJyYXdDb2xsZWN0aW9uIiwiY29sbGVjdGlvbk5hbWUiLCJjb2xsZWN0aW9uIiwiX2NyZWF0ZUNhcHBlZENvbGxlY3Rpb24iLCJieXRlU2l6ZSIsIm1heERvY3VtZW50cyIsImZ1dHVyZSIsImNyZWF0ZUNvbGxlY3Rpb24iLCJjYXBwZWQiLCJtYXgiLCJyZXNvbHZlciIsIl9tYXliZUJlZ2luV3JpdGUiLCJmZW5jZSIsIkREUFNlcnZlciIsIl9DdXJyZW50V3JpdGVGZW5jZSIsImdldCIsImJlZ2luV3JpdGUiLCJjb21taXR0ZWQiLCJfb25GYWlsb3ZlciIsInJlZ2lzdGVyIiwid3JpdGVDYWxsYmFjayIsIndyaXRlIiwicmVmcmVzaCIsImVyciIsInJlc3VsdCIsInJlZnJlc2hFcnIiLCJiaW5kRW52aXJvbm1lbnRGb3JXcml0ZSIsIl9pbnNlcnQiLCJjb2xsZWN0aW9uX25hbWUiLCJzZW5kRXJyb3IiLCJlIiwiX2V4cGVjdGVkQnlUZXN0IiwiTG9jYWxDb2xsZWN0aW9uIiwiX2lzUGxhaW5PYmplY3QiLCJpZCIsIl9pZCIsImluc2VydE9uZSIsInNhZmUiLCJ0aGVuIiwiaW5zZXJ0ZWRJZCIsImNhdGNoIiwiX3JlZnJlc2giLCJzZWxlY3RvciIsInJlZnJlc2hLZXkiLCJzcGVjaWZpY0lkcyIsIl9pZHNNYXRjaGVkQnlTZWxlY3RvciIsImV4dGVuZCIsIl9yZW1vdmUiLCJkZWxldGVNYW55IiwiZGVsZXRlZENvdW50IiwidHJhbnNmb3JtUmVzdWx0IiwibW9kaWZpZWRDb3VudCIsIm51bWJlckFmZmVjdGVkIiwiX2Ryb3BDb2xsZWN0aW9uIiwiY2IiLCJkcm9wQ29sbGVjdGlvbiIsImRyb3AiLCJfZHJvcERhdGFiYXNlIiwiZHJvcERhdGFiYXNlIiwiX3VwZGF0ZSIsIm1vZCIsIkZ1bmN0aW9uIiwibW9uZ29PcHRzIiwiYXJyYXlGaWx0ZXJzIiwidXBzZXJ0IiwibXVsdGkiLCJmdWxsUmVzdWx0IiwibW9uZ29TZWxlY3RvciIsIm1vbmdvTW9kIiwiaXNNb2RpZnkiLCJfaXNNb2RpZmljYXRpb25Nb2QiLCJfZm9yYmlkUmVwbGFjZSIsImtub3duSWQiLCJuZXdEb2MiLCJfY3JlYXRlVXBzZXJ0RG9jdW1lbnQiLCJnZW5lcmF0ZWRJZCIsInNpbXVsYXRlVXBzZXJ0V2l0aEluc2VydGVkSWQiLCJlcnJvciIsIl9yZXR1cm5PYmplY3QiLCJoYXNPd25Qcm9wZXJ0eSIsIiRzZXRPbkluc2VydCIsInN0cmluZ3MiLCJrZXlzIiwic3RhcnRzV2l0aCIsInVwZGF0ZU1ldGhvZCIsImxlbmd0aCIsIm1ldGVvclJlc3VsdCIsImRyaXZlclJlc3VsdCIsIm1vbmdvUmVzdWx0IiwidXBzZXJ0ZWRDb3VudCIsInVwc2VydGVkSWQiLCJuIiwibWF0Y2hlZENvdW50IiwiTlVNX09QVElNSVNUSUNfVFJJRVMiLCJfaXNDYW5ub3RDaGFuZ2VJZEVycm9yIiwiZXJybXNnIiwiaW5kZXhPZiIsIm1vbmdvT3B0c0ZvclVwZGF0ZSIsIm1vbmdvT3B0c0Zvckluc2VydCIsInJlcGxhY2VtZW50V2l0aElkIiwidHJpZXMiLCJkb1VwZGF0ZSIsIm1ldGhvZCIsInVwZGF0ZU1hbnkiLCJzb21lIiwicmVwbGFjZU9uZSIsImRvQ29uZGl0aW9uYWxJbnNlcnQiLCJ3cmFwQXN5bmMiLCJhcHBseSIsImFyZ3VtZW50cyIsInVwZGF0ZSIsImZpbmQiLCJDdXJzb3IiLCJDdXJzb3JEZXNjcmlwdGlvbiIsImZpbmRPbmVBc3luYyIsImxpbWl0IiwiZmV0Y2hBc3luYyIsImZpbmRPbmUiLCJmcm9tUHJvbWlzZSIsImNyZWF0ZUluZGV4QXN5bmMiLCJpbmRleCIsImNyZWF0ZUluZGV4IiwiY291bnREb2N1bWVudHMiLCJhcmdzIiwiYXJnIiwiZXN0aW1hdGVkRG9jdW1lbnRDb3VudCIsIl9lbnN1cmVJbmRleCIsIl9kcm9wSW5kZXgiLCJpbmRleE5hbWUiLCJkcm9wSW5kZXgiLCJDb2xsZWN0aW9uIiwiX3Jld3JpdGVTZWxlY3RvciIsImN1cnNvckRlc2NyaXB0aW9uIiwiX21vbmdvIiwiX2N1cnNvckRlc2NyaXB0aW9uIiwiX3N5bmNocm9ub3VzQ3Vyc29yIiwic2V0dXBTeW5jaHJvbm91c0N1cnNvciIsImN1cnNvciIsInRhaWxhYmxlIiwiX2NyZWF0ZVN5bmNocm9ub3VzQ3Vyc29yIiwic2VsZkZvckl0ZXJhdGlvbiIsInVzZVRyYW5zZm9ybSIsImNvdW50IiwiUHJvbWlzZSIsImF3YWl0IiwiU3ltYm9sIiwiaXRlcmF0b3IiLCJhc3luY0l0ZXJhdG9yIiwibWV0aG9kTmFtZSIsIm1ldGhvZE5hbWVBc3luYyIsImlzQ2FsbGVkRnJvbUFzeW5jIiwicmVzb2x2ZSIsInJlamVjdCIsImdldFRyYW5zZm9ybSIsInRyYW5zZm9ybSIsIl9wdWJsaXNoQ3Vyc29yIiwic3ViIiwiX2dldENvbGxlY3Rpb25OYW1lIiwib2JzZXJ2ZSIsImNhbGxiYWNrcyIsIl9vYnNlcnZlRnJvbU9ic2VydmVDaGFuZ2VzIiwib2JzZXJ2ZUNoYW5nZXMiLCJtZXRob2RzIiwib3JkZXJlZCIsIl9vYnNlcnZlQ2hhbmdlc0NhbGxiYWNrc0FyZU9yZGVyZWQiLCJleGNlcHRpb25OYW1lIiwiX2Zyb21PYnNlcnZlIiwiX29ic2VydmVDaGFuZ2VzIiwibm9uTXV0YXRpbmdDYWxsYmFja3MiLCJwaWNrIiwiY3Vyc29yT3B0aW9ucyIsInNvcnQiLCJza2lwIiwicHJvamVjdGlvbiIsImZpZWxkcyIsInJlYWRQcmVmZXJlbmNlIiwibnVtYmVyT2ZSZXRyaWVzIiwiZGJDdXJzb3IiLCJhZGRDdXJzb3JGbGFnIiwiT1BMT0dfQ09MTEVDVElPTiIsInRzIiwibWF4VGltZU1zIiwibWF4VGltZU1TIiwiaGludCIsIlN5bmNocm9ub3VzQ3Vyc29yIiwiX2RiQ3Vyc29yIiwiX3NlbGZGb3JJdGVyYXRpb24iLCJfdHJhbnNmb3JtIiwid3JhcFRyYW5zZm9ybSIsIl9zeW5jaHJvbm91c0NvdW50IiwiX3Zpc2l0ZWRJZHMiLCJfSWRNYXAiLCJfcmF3TmV4dE9iamVjdFByb21pc2UiLCJuZXh0IiwiZG9jIiwiX25leHRPYmplY3RQcm9taXNlIiwic2V0IiwiX25leHRPYmplY3RQcm9taXNlV2l0aFRpbWVvdXQiLCJ0aW1lb3V0TVMiLCJuZXh0T2JqZWN0UHJvbWlzZSIsInRpbWVvdXRFcnIiLCJ0aW1lb3V0UHJvbWlzZSIsInRpbWVyIiwic2V0VGltZW91dCIsInJhY2UiLCJfbmV4dE9iamVjdCIsInRoaXNBcmciLCJ3cmFwcGVkRm4iLCJ3cmFwRm4iLCJfcmV3aW5kIiwiY2FsbCIsInJlcyIsInB1c2giLCJyZXdpbmQiLCJmZXRjaCIsImlkZW50aXR5IiwiZ2V0UmF3T2JqZWN0cyIsInJlc3VsdHMiLCJkb25lIiwic3luY1Jlc3VsdCIsInRhaWwiLCJkb2NDYWxsYmFjayIsInN0b3BwZWQiLCJsYXN0VFMiLCJsb29wIiwibmV3U2VsZWN0b3IiLCIkZ3QiLCJkZWZlciIsIl9vYnNlcnZlQ2hhbmdlc1RhaWxhYmxlIiwiZmllbGRzT3B0aW9ucyIsIm9ic2VydmVLZXkiLCJzdHJpbmdpZnkiLCJtdWx0aXBsZXhlciIsIm9ic2VydmVEcml2ZXIiLCJmaXJzdEhhbmRsZSIsIl9ub1lpZWxkc0FsbG93ZWQiLCJPYnNlcnZlTXVsdGlwbGV4ZXIiLCJvblN0b3AiLCJvYnNlcnZlSGFuZGxlIiwiT2JzZXJ2ZUhhbmRsZSIsIm1hdGNoZXIiLCJzb3J0ZXIiLCJjYW5Vc2VPcGxvZyIsImFsbCIsIl90ZXN0T25seVBvbGxDYWxsYmFjayIsIk1pbmltb25nbyIsIk1hdGNoZXIiLCJPcGxvZ09ic2VydmVEcml2ZXIiLCJjdXJzb3JTdXBwb3J0ZWQiLCJTb3J0ZXIiLCJmIiwiZHJpdmVyQ2xhc3MiLCJQb2xsaW5nT2JzZXJ2ZURyaXZlciIsIm1vbmdvSGFuZGxlIiwiX29ic2VydmVEcml2ZXIiLCJhZGRIYW5kbGVBbmRTZW5kSW5pdGlhbEFkZHMiLCJsaXN0ZW5BbGwiLCJsaXN0ZW5DYWxsYmFjayIsImxpc3RlbmVycyIsImZvckVhY2hUcmlnZ2VyIiwidHJpZ2dlciIsIl9JbnZhbGlkYXRpb25Dcm9zc2JhciIsImxpc3RlbiIsImxpc3RlbmVyIiwidHJpZ2dlckNhbGxiYWNrIiwiYWRkZWRCZWZvcmUiLCJhZGRlZCIsIk1vbmdvVGltZXN0YW1wIiwiQ29ubmVjdGlvbiIsIkxvbmciLCJUT09fRkFSX0JFSElORCIsInByb2Nlc3MiLCJlbnYiLCJNRVRFT1JfT1BMT0dfVE9PX0ZBUl9CRUhJTkQiLCJUQUlMX1RJTUVPVVQiLCJNRVRFT1JfT1BMT0dfVEFJTF9USU1FT1VUIiwic2hvd1RTIiwiZ2V0SGlnaEJpdHMiLCJnZXRMb3dCaXRzIiwiaWRGb3JPcCIsIm9wIiwibyIsIm8yIiwiZGJOYW1lIiwiX29wbG9nVXJsIiwiX2RiTmFtZSIsIl9vcGxvZ0xhc3RFbnRyeUNvbm5lY3Rpb24iLCJfb3Bsb2dUYWlsQ29ubmVjdGlvbiIsIl9zdG9wcGVkIiwiX3RhaWxIYW5kbGUiLCJfcmVhZHlGdXR1cmUiLCJfY3Jvc3NiYXIiLCJfQ3Jvc3NiYXIiLCJmYWN0UGFja2FnZSIsImZhY3ROYW1lIiwiX2Jhc2VPcGxvZ1NlbGVjdG9yIiwibnMiLCJSZWdFeHAiLCJfZXNjYXBlUmVnRXhwIiwiJG9yIiwiJGluIiwiJGV4aXN0cyIsIl9jYXRjaGluZ1VwRnV0dXJlcyIsIl9sYXN0UHJvY2Vzc2VkVFMiLCJfb25Ta2lwcGVkRW50cmllc0hvb2siLCJkZWJ1Z1ByaW50RXhjZXB0aW9ucyIsIl9lbnRyeVF1ZXVlIiwiX0RvdWJsZUVuZGVkUXVldWUiLCJfd29ya2VyQWN0aXZlIiwiX3N0YXJ0VGFpbGluZyIsIm9uT3Bsb2dFbnRyeSIsIm9yaWdpbmFsQ2FsbGJhY2siLCJub3RpZmljYXRpb24iLCJfZGVidWciLCJsaXN0ZW5IYW5kbGUiLCJvblNraXBwZWRFbnRyaWVzIiwid2FpdFVudGlsQ2F1Z2h0VXAiLCJsYXN0RW50cnkiLCIkbmF0dXJhbCIsIl9zbGVlcEZvck1zIiwibGVzc1RoYW5PckVxdWFsIiwiaW5zZXJ0QWZ0ZXIiLCJncmVhdGVyVGhhbiIsInNwbGljZSIsIm1vbmdvZGJVcmkiLCJwYXJzZSIsImRhdGFiYXNlIiwiYWRtaW4iLCJjb21tYW5kIiwiaXNtYXN0ZXIiLCJpc01hc3RlckRvYyIsInNldE5hbWUiLCJsYXN0T3Bsb2dFbnRyeSIsIm9wbG9nU2VsZWN0b3IiLCJfbWF5YmVTdGFydFdvcmtlciIsInJldHVybiIsImhhbmRsZURvYyIsImFwcGx5T3BzIiwibmV4dFRpbWVzdGFtcCIsImFkZCIsIk9ORSIsInNsaWNlIiwiZmlyZSIsImlzRW1wdHkiLCJwb3AiLCJjbGVhciIsIl9zZXRMYXN0UHJvY2Vzc2VkVFMiLCJzaGlmdCIsInNlcXVlbmNlciIsIl9kZWZpbmVUb29GYXJCZWhpbmQiLCJfcmVzZXRUb29GYXJCZWhpbmQiLCJfb2JqZWN0V2l0aG91dFByb3BlcnRpZXMiLCJGYWN0cyIsImluY3JlbWVudFNlcnZlckZhY3QiLCJfb3JkZXJlZCIsIl9vblN0b3AiLCJfcXVldWUiLCJfU3luY2hyb25vdXNRdWV1ZSIsIl9oYW5kbGVzIiwiX2NhY2hlIiwiX0NhY2hpbmdDaGFuZ2VPYnNlcnZlciIsIl9hZGRIYW5kbGVUYXNrc1NjaGVkdWxlZEJ1dE5vdFBlcmZvcm1lZCIsImNhbGxiYWNrTmFtZXMiLCJjYWxsYmFja05hbWUiLCJfYXBwbHlDYWxsYmFjayIsInRvQXJyYXkiLCJoYW5kbGUiLCJzYWZlVG9SdW5UYXNrIiwicnVuVGFzayIsIl9zZW5kQWRkcyIsInJlbW92ZUhhbmRsZSIsIl9yZWFkeSIsIl9zdG9wIiwiZnJvbVF1ZXJ5RXJyb3IiLCJyZWFkeSIsInF1ZXVlVGFzayIsInF1ZXJ5RXJyb3IiLCJ0aHJvdyIsIm9uRmx1c2giLCJpc1Jlc29sdmVkIiwiYXBwbHlDaGFuZ2UiLCJoYW5kbGVJZCIsIl9hZGRlZEJlZm9yZSIsIl9hZGRlZCIsImRvY3MiLCJuZXh0T2JzZXJ2ZUhhbmRsZUlkIiwiX211bHRpcGxleGVyIiwiYmVmb3JlIiwiZXhwb3J0IiwiRmliZXIiLCJjb25zdHJ1Y3RvciIsIm1vbmdvQ29ubmVjdGlvbiIsIl9tb25nb0Nvbm5lY3Rpb24iLCJfY2FsbGJhY2tzRm9yT3AiLCJNYXAiLCJjaGVjayIsIlN0cmluZyIsImRlbGV0ZSIsInJ1biIsIlBPTExJTkdfVEhST1RUTEVfTVMiLCJNRVRFT1JfUE9MTElOR19USFJPVFRMRV9NUyIsIlBPTExJTkdfSU5URVJWQUxfTVMiLCJNRVRFT1JfUE9MTElOR19JTlRFUlZBTF9NUyIsIl9tb25nb0hhbmRsZSIsIl9zdG9wQ2FsbGJhY2tzIiwiX3Jlc3VsdHMiLCJfcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkIiwiX3BlbmRpbmdXcml0ZXMiLCJfZW5zdXJlUG9sbElzU2NoZWR1bGVkIiwidGhyb3R0bGUiLCJfdW50aHJvdHRsZWRFbnN1cmVQb2xsSXNTY2hlZHVsZWQiLCJwb2xsaW5nVGhyb3R0bGVNcyIsIl90YXNrUXVldWUiLCJsaXN0ZW5lcnNIYW5kbGUiLCJwb2xsaW5nSW50ZXJ2YWwiLCJwb2xsaW5nSW50ZXJ2YWxNcyIsIl9wb2xsaW5nSW50ZXJ2YWwiLCJpbnRlcnZhbEhhbmRsZSIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsIl9wb2xsTW9uZ28iLCJfc3VzcGVuZFBvbGxpbmciLCJfcmVzdW1lUG9sbGluZyIsImZpcnN0IiwibmV3UmVzdWx0cyIsIm9sZFJlc3VsdHMiLCJ3cml0ZXNGb3JDeWNsZSIsImNvZGUiLCJKU09OIiwibWVzc2FnZSIsIkFycmF5IiwiX2RpZmZRdWVyeUNoYW5nZXMiLCJ3IiwiYyIsIm9wbG9nVjJWMUNvbnZlcnRlciIsIlBIQVNFIiwiUVVFUllJTkciLCJGRVRDSElORyIsIlNURUFEWSIsIlN3aXRjaGVkVG9RdWVyeSIsImZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5IiwiY3VycmVudElkIiwiX3VzZXNPcGxvZyIsImNvbXBhcmF0b3IiLCJnZXRDb21wYXJhdG9yIiwiaGVhcE9wdGlvbnMiLCJJZE1hcCIsIl9saW1pdCIsIl9jb21wYXJhdG9yIiwiX3NvcnRlciIsIl91bnB1Ymxpc2hlZEJ1ZmZlciIsIk1pbk1heEhlYXAiLCJfcHVibGlzaGVkIiwiTWF4SGVhcCIsIl9zYWZlQXBwZW5kVG9CdWZmZXIiLCJfc3RvcEhhbmRsZXMiLCJfcmVnaXN0ZXJQaGFzZUNoYW5nZSIsIl9tYXRjaGVyIiwiX3Byb2plY3Rpb25GbiIsIl9jb21waWxlUHJvamVjdGlvbiIsIl9zaGFyZWRQcm9qZWN0aW9uIiwiY29tYmluZUludG9Qcm9qZWN0aW9uIiwiX3NoYXJlZFByb2plY3Rpb25GbiIsIl9uZWVkVG9GZXRjaCIsIl9jdXJyZW50bHlGZXRjaGluZyIsIl9mZXRjaEdlbmVyYXRpb24iLCJfcmVxdWVyeVdoZW5Eb25lVGhpc1F1ZXJ5IiwiX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHkiLCJfbmVlZFRvUG9sbFF1ZXJ5IiwiX3BoYXNlIiwiX2hhbmRsZU9wbG9nRW50cnlRdWVyeWluZyIsIl9oYW5kbGVPcGxvZ0VudHJ5U3RlYWR5T3JGZXRjaGluZyIsImZpcmVkIiwiX29wbG9nT2JzZXJ2ZURyaXZlcnMiLCJvbkJlZm9yZUZpcmUiLCJkcml2ZXJzIiwiZHJpdmVyIiwiX3J1bkluaXRpYWxRdWVyeSIsIl9hZGRQdWJsaXNoZWQiLCJvdmVyZmxvd2luZ0RvY0lkIiwibWF4RWxlbWVudElkIiwib3ZlcmZsb3dpbmdEb2MiLCJlcXVhbHMiLCJyZW1vdmUiLCJyZW1vdmVkIiwiX2FkZEJ1ZmZlcmVkIiwiX3JlbW92ZVB1Ymxpc2hlZCIsImVtcHR5IiwibmV3RG9jSWQiLCJtaW5FbGVtZW50SWQiLCJfcmVtb3ZlQnVmZmVyZWQiLCJfY2hhbmdlUHVibGlzaGVkIiwib2xkRG9jIiwicHJvamVjdGVkTmV3IiwicHJvamVjdGVkT2xkIiwiY2hhbmdlZCIsIkRpZmZTZXF1ZW5jZSIsIm1ha2VDaGFuZ2VkRmllbGRzIiwibWF4QnVmZmVyZWRJZCIsIl9hZGRNYXRjaGluZyIsIm1heFB1Ymxpc2hlZCIsIm1heEJ1ZmZlcmVkIiwidG9QdWJsaXNoIiwiY2FuQXBwZW5kVG9CdWZmZXIiLCJjYW5JbnNlcnRJbnRvQnVmZmVyIiwidG9CdWZmZXIiLCJfcmVtb3ZlTWF0Y2hpbmciLCJfaGFuZGxlRG9jIiwibWF0Y2hlc05vdyIsImRvY3VtZW50TWF0Y2hlcyIsInB1Ymxpc2hlZEJlZm9yZSIsImJ1ZmZlcmVkQmVmb3JlIiwiY2FjaGVkQmVmb3JlIiwibWluQnVmZmVyZWQiLCJzdGF5c0luUHVibGlzaGVkIiwic3RheXNJbkJ1ZmZlciIsIl9mZXRjaE1vZGlmaWVkRG9jdW1lbnRzIiwidGhpc0dlbmVyYXRpb24iLCJ3YWl0aW5nIiwiZnV0IiwiX2JlU3RlYWR5Iiwid3JpdGVzIiwiaXNSZXBsYWNlIiwiY2FuRGlyZWN0bHlNb2RpZnlEb2MiLCJtb2RpZmllckNhbkJlRGlyZWN0bHlBcHBsaWVkIiwiX21vZGlmeSIsImNhbkJlY29tZVRydWVCeU1vZGlmaWVyIiwiYWZmZWN0ZWRCeU1vZGlmaWVyIiwiX3J1blF1ZXJ5IiwiaW5pdGlhbCIsIl9kb25lUXVlcnlpbmciLCJfcG9sbFF1ZXJ5IiwibmV3QnVmZmVyIiwiX2N1cnNvckZvclF1ZXJ5IiwiaSIsIl9wdWJsaXNoTmV3UmVzdWx0cyIsIm9wdGlvbnNPdmVyd3JpdGUiLCJkZXNjcmlwdGlvbiIsImlkc1RvUmVtb3ZlIiwiX29wbG9nRW50cnlIYW5kbGUiLCJfbGlzdGVuZXJzSGFuZGxlIiwicGhhc2UiLCJub3ciLCJEYXRlIiwidGltZURpZmYiLCJfcGhhc2VTdGFydFRpbWUiLCJkaXNhYmxlT3Bsb2ciLCJfZGlzYWJsZU9wbG9nIiwiX2NoZWNrU3VwcG9ydGVkUHJvamVjdGlvbiIsImhhc1doZXJlIiwiaGFzR2VvUXVlcnkiLCJtb2RpZmllciIsIm9wZXJhdGlvbiIsImZpZWxkIiwidGVzdCIsInByZWZpeCIsImFycmF5T3BlcmF0b3JLZXlSZWdleCIsImlzQXJyYXlPcGVyYXRvcktleSIsImlzQXJyYXlPcGVyYXRvciIsIm9wZXJhdG9yIiwiYSIsImV2ZXJ5IiwiZmxhdHRlbk9iamVjdEludG8iLCJ0YXJnZXQiLCJzb3VyY2UiLCJsb2dEZWJ1Z01lc3NhZ2VzIiwiT1BMT0dfQ09OVkVSVEVSX0RFQlVHIiwiY29udmVydE9wbG9nRGlmZiIsIm9wbG9nRW50cnkiLCJkaWZmIiwiY29uc29sZSIsImxvZyIsImRpZmZLZXkiLCIkdW5zZXQiLCIkc2V0IiwicG9zaXRpb24iLCJwb3NpdGlvbktleSIsIiR2IiwiY29udmVydGVkT3Bsb2dFbnRyeSIsIkxvY2FsQ29sbGVjdGlvbkRyaXZlciIsIm5vQ29ubkNvbGxlY3Rpb25zIiwiY3JlYXRlIiwib3BlbiIsImNvbm4iLCJlbnN1cmVDb2xsZWN0aW9uIiwiX21vbmdvX2xpdmVkYXRhX2NvbGxlY3Rpb25zIiwiY29sbGVjdGlvbnMiLCJBU1lOQ19DT0xMRUNUSU9OX01FVEhPRFMiLCJSZW1vdGVDb2xsZWN0aW9uRHJpdmVyIiwibW9uZ29fdXJsIiwiUkVNT1RFX0NPTExFQ1RJT05fTUVUSE9EUyIsIm0iLCJpbmNsdWRlcyIsImFzeW5jTWV0aG9kTmFtZSIsImRlZmF1bHRSZW1vdGVDb2xsZWN0aW9uRHJpdmVyIiwib25jZSIsImNvbm5lY3Rpb25PcHRpb25zIiwibW9uZ29VcmwiLCJNT05HT19VUkwiLCJNT05HT19PUExPR19VUkwiLCJzdGFydHVwIiwiY29ubmVjdCIsIndhcm5Vc2luZ09sZEFwaSIsIldBUk5fV0hFTl9VU0lOR19PTERfQVBJIiwid2FybiIsInRyYWNlIiwiY29ubmVjdGlvbiIsIm1hbmFnZXIiLCJpZEdlbmVyYXRpb24iLCJfZHJpdmVyIiwiX3ByZXZlbnRBdXRvcHVibGlzaCIsIl9tYWtlTmV3SUQiLCJzcmMiLCJERFAiLCJyYW5kb21TdHJlYW0iLCJSYW5kb20iLCJpbnNlY3VyZSIsImhleFN0cmluZyIsIl9jb25uZWN0aW9uIiwiaXNDbGllbnQiLCJzZXJ2ZXIiLCJfY29sbGVjdGlvbiIsIl9uYW1lIiwiX21heWJlU2V0VXBSZXBsaWNhdGlvbiIsImRlZmluZU11dGF0aW9uTWV0aG9kcyIsIl9kZWZpbmVNdXRhdGlvbk1ldGhvZHMiLCJ1c2VFeGlzdGluZyIsIl9zdXBwcmVzc1NhbWVOYW1lRXJyb3IiLCJhdXRvcHVibGlzaCIsInB1Ymxpc2giLCJpc19hdXRvIiwicmVnaXN0ZXJTdG9yZSIsIm9rIiwiYmVnaW5VcGRhdGUiLCJiYXRjaFNpemUiLCJyZXNldCIsInBhdXNlT2JzZXJ2ZXJzIiwibXNnIiwibW9uZ29JZCIsIk1vbmdvSUQiLCJpZFBhcnNlIiwiX2RvY3MiLCJfcmVmIiwiaW5zZXJ0IiwiZW5kVXBkYXRlIiwicmVzdW1lT2JzZXJ2ZXJzIiwic2F2ZU9yaWdpbmFscyIsInJldHJpZXZlT3JpZ2luYWxzIiwiZ2V0RG9jIiwiX2dldENvbGxlY3Rpb24iLCJfZ2V0RmluZFNlbGVjdG9yIiwiX2dldEZpbmRPcHRpb25zIiwibmV3T3B0aW9ucyIsIk1hdGNoIiwiT3B0aW9uYWwiLCJPYmplY3RJbmNsdWRpbmciLCJPbmVPZiIsIk51bWJlciIsImZhbGxiYWNrSWQiLCJfc2VsZWN0b3JJc0lkIiwiZ2V0UHJvdG90eXBlT2YiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZ2VuZXJhdGVJZCIsIl9pc1JlbW90ZUNvbGxlY3Rpb24iLCJlbmNsb3NpbmciLCJfQ3VycmVudE1ldGhvZEludm9jYXRpb24iLCJjaG9vc2VSZXR1cm5WYWx1ZUZyb21Db2xsZWN0aW9uUmVzdWx0Iiwid3JhcHBlZENhbGxiYWNrIiwid3JhcENhbGxiYWNrIiwiX2NhbGxNdXRhdG9yTWV0aG9kIiwib3B0aW9uc0FuZENhbGxiYWNrIiwicG9wQ2FsbGJhY2tGcm9tQXJncyIsIkxvZyIsImRlYnVnIiwicmVDcmVhdGVJbmRleE9uT3B0aW9uTWlzbWF0Y2giLCJpbmZvIiwicmF3RGF0YWJhc2UiLCJjb252ZXJ0UmVzdWx0IiwiQWxsb3dEZW55IiwiQ29sbGVjdGlvblByb3RvdHlwZSIsInNldENvbm5lY3Rpb25PcHRpb25zIiwib3RoZXJPcHRpb25zIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQUFBLElBQUlBLGFBQWE7RUFBQ0MsT0FBTyxDQUFDQyxJQUFJLENBQUMsc0NBQXNDLEVBQUM7SUFBQ0MsT0FBTyxDQUFDQyxDQUFDLEVBQUM7TUFBQ0osYUFBYSxHQUFDSSxDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBQXRHLElBQUlDLG1CQUFtQjtFQUFDSixPQUFPLENBQUNDLElBQUksQ0FBQyxlQUFlLEVBQUM7SUFBQ0csbUJBQW1CLENBQUNELENBQUMsRUFBQztNQUFDQyxtQkFBbUIsR0FBQ0QsQ0FBQztJQUFBO0VBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztFQUFDLElBQUlFLFVBQVU7RUFBQ0wsT0FBTyxDQUFDQyxJQUFJLENBQUMsa0JBQWtCLEVBQUM7SUFBQ0ksVUFBVSxDQUFDRixDQUFDLEVBQUM7TUFBQ0UsVUFBVSxHQUFDRixDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBQUMsSUFBSUcsb0JBQW9CLEVBQUNDLGtCQUFrQjtFQUFDUCxPQUFPLENBQUNDLElBQUksQ0FBQyw0QkFBNEIsRUFBQztJQUFDSyxvQkFBb0IsQ0FBQ0gsQ0FBQyxFQUFDO01BQUNHLG9CQUFvQixHQUFDSCxDQUFDO0lBQUEsQ0FBQztJQUFDSSxrQkFBa0IsQ0FBQ0osQ0FBQyxFQUFDO01BQUNJLGtCQUFrQixHQUFDSixDQUFDO0lBQUE7RUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0VBRTlXO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0VBRUEsTUFBTUssSUFBSSxHQUFHQyxPQUFPLENBQUMsTUFBTSxDQUFDO0VBQzVCLE1BQU1DLElBQUksR0FBR0QsT0FB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Q0FBQyxDQUFDO0FBQUMsSUFBSW9kLHdCQUF3QjtBQUFDbmMsTUFBTSxDQUFDbkIsSUFBSSxDQUFDLGdEQUFnRCxFQUFDO0VBQUNDLE9BQU8sQ0FBQ0MsQ0FBQyxFQUFDO0lBQUNvZCx3QkFBd0IsR0FBQ3BkLENBQUM7RUFBQTtBQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7QUFBM09pQixNQUFNLENBQUN3ZSxNQUFNLENBQUM7RUFBQ3hmLG1CQUFtQixFQUFDLE1BQUlBO0FBQW1CLENBQUMsQ0FBQztBQUFyRCxNQUFNQSxtQkFBbUIsR0FBR3FFLE9BQU8sSUFBSTtFQUM1QztFQUNBLGFBQWdEQSxPQUFPLElBQUksQ0FBQyxDQUFDO0lBQXZEO01BQUU2TixNQUFNO01BQUVEO0lBQTRCLENBQUM7SUFBZDRmLFlBQVk7RUFDM0M7RUFDQTs7RUFFQSx1Q0FDS0EsWUFBWSxHQUNYNWYsVUFBVSxJQUFJQyxNQUFNLEdBQUc7SUFBRUQsVUFBVSxFQUFFQyxNQUFNLElBQUlEO0VBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUV4RSxDQUFDLEMiLCJmaWxlIjoiL3BhY2thZ2VzL21vbmdvLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbm9ybWFsaXplUHJvamVjdGlvbiB9IGZyb20gXCIuL21vbmdvX3V0aWxzXCI7XG5cbi8qKlxuICogUHJvdmlkZSBhIHN5bmNocm9ub3VzIENvbGxlY3Rpb24gQVBJIHVzaW5nIGZpYmVycywgYmFja2VkIGJ5XG4gKiBNb25nb0RCLiAgVGhpcyBpcyBvbmx5IGZvciB1c2Ugb24gdGhlIHNlcnZlciwgYW5kIG1vc3RseSBpZGVudGljYWxcbiAqIHRvIHRoZSBjbGllbnQgQVBJLlxuICpcbiAqIE5PVEU6IHRoZSBwdWJsaWMgQVBJIG1ldGhvZHMgbXVzdCBiZSBydW4gd2l0aGluIGEgZmliZXIuIElmIHlvdSBjYWxsXG4gKiB0aGVzZSBvdXRzaWRlIG9mIGEgZmliZXIgdGhleSB3aWxsIGV4cGxvZGUhXG4gKi9cblxuY29uc3QgcGF0aCA9IHJlcXVpcmUoXCJwYXRoXCIpO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoXCJ1dGlsXCIpO1xuXG4vKiogQHR5cGUge2ltcG9ydCgnbW9uZ29kYicpfSAqL1xudmFyIE1vbmdvREIgPSBOcG1Nb2R1bGVNb25nb2RiO1xudmFyIEZ1dHVyZSA9IE5wbS5yZXF1aXJlKCdmaWJlcnMvZnV0dXJlJyk7XG5pbXBvcnQgeyBEb2NGZXRjaGVyIH0gZnJvbSBcIi4vZG9jX2ZldGNoZXIuanNcIjtcbmltcG9ydCB7XG4gIEFTWU5DX0NVUlNPUl9NRVRIT0RTLFxuICBnZXRBc3luY01ldGhvZE5hbWVcbn0gZnJvbSBcIm1ldGVvci9taW5pbW9uZ28vY29uc3RhbnRzXCI7XG5cbk1vbmdvSW50ZXJuYWxzID0ge307XG5cbk1vbmdvSW50ZXJuYWxzLk5wbU1vZHVsZXMgPSB7XG4gIG1vbmdvZGI6IHtcbiAgICB2ZXJzaW9uOiBOcG1Nb2R1bGVNb25nb2RiVmVyc2lvbixcbiAgICBtb2R1bGU6IE1vbmdvREJcbiAgfVxufTtcblxuLy8gT2xkZXIgdmVyc2lvbiBvZiB3aGF0IGlzIG5vdyBhdmFpbGFibGUgdmlhXG4vLyBNb25nb0ludGVybmFscy5OcG1Nb2R1bGVzLm1vbmdvZGIubW9kdWxlLiAgSXQgd2FzIG5ldmVyIGRvY3VtZW50ZWQsIGJ1dFxuLy8gcGVvcGxlIGRvIHVzZSBpdC5cbi8vIFhYWCBDT01QQVQgV0lUSCAxLjAuMy4yXG5Nb25nb0ludGVybmFscy5OcG1Nb2R1bGUgPSBNb25nb0RCO1xuXG5jb25zdCBGSUxFX0FTU0VUX1NVRkZJWCA9ICdBc3NldCc7XG5jb25zdCBBU1NFVFNfRk9MREVSID0gJ2Fzc2V0cyc7XG5jb25zdCBBUFBfRk9MREVSID0gJ2FwcCc7XG5cbi8vIFRoaXMgaXMgdXNlZCB0byBhZGQgb3IgcmVtb3ZlIEVKU09OIGZyb20gdGhlIGJlZ2lubmluZyBvZiBldmVyeXRoaW5nIG5lc3RlZFxuLy8gaW5zaWRlIGFuIEVKU09OIGN1c3RvbSB0eXBlLiBJdCBzaG91bGQgb25seSBiZSBjYWxsZWQgb24gcHVyZSBKU09OIVxudmFyIHJlcGxhY2VOYW1lcyA9IGZ1bmN0aW9uIChmaWx0ZXIsIHRoaW5nKSB7XG4gIGlmICh0eXBlb2YgdGhpbmcgPT09IFwib2JqZWN0XCIgJiYgdGhpbmcgIT09IG51bGwpIHtcbiAgICBpZiAoXy5pc0FycmF5KHRoaW5nKSkge1xuICAgICAgcmV0dXJuIF8ubWFwKHRoaW5nLCBfLmJpbmQocmVwbGFjZU5hbWVzLCBudWxsLCBmaWx0ZXIpKTtcbiAgICB9XG4gICAgdmFyIHJldCA9IHt9O1xuICAgIF8uZWFjaCh0aGluZywgZnVuY3Rpb24gKHZhbHVlLCBrZXkpIHtcbiAgICAgIHJldFtmaWx0ZXIoa2V5KV0gPSByZXBsYWNlTmFtZXMoZmlsdGVyLCB2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuICByZXR1cm4gdGhpbmc7XG59O1xuXG4vLyBFbnN1cmUgdGhhdCBFSlNPTi5jbG9uZSBrZWVwcyBhIFRpbWVzdGFtcCBhcyBhIFRpbWVzdGFtcCAoaW5zdGVhZCBvZiBqdXN0XG4vLyBkb2luZyBhIHN0cnVjdHVyYWwgY2xvbmUpLlxuLy8gWFhYIGhvdyBvayBpcyB0aGlzPyB3aGF0IGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBjb3BpZXMgb2YgTW9uZ29EQiBsb2FkZWQ/XG5Nb25nb0RCLlRpbWVzdGFtcC5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIFRpbWVzdGFtcHMgc2hvdWxkIGJlIGltbXV0YWJsZS5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG52YXIgbWFrZU1vbmdvTGVnYWwgPSBmdW5jdGlvbiAobmFtZSkgeyByZXR1cm4gXCJFSlNPTlwiICsgbmFtZTsgfTtcbnZhciB1bm1ha2VNb25nb0xlZ2FsID0gZnVuY3Rpb24gKG5hbWUpIHsgcmV0dXJuIG5hbWUuc3Vic3RyKDUpOyB9O1xuXG52YXIgcmVwbGFjZU1vbmdvQXRvbVdpdGhNZXRlb3IgPSBmdW5jdGlvbiAoZG9jdW1lbnQpIHtcbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgTW9uZ29EQi5CaW5hcnkpIHtcbiAgICAvLyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgICBpZiAoZG9jdW1lbnQuc3ViX3R5cGUgIT09IDApIHtcbiAgICAgIHJldHVybiBkb2N1bWVudDtcbiAgICB9XG4gICAgdmFyIGJ1ZmZlciA9IGRvY3VtZW50LnZhbHVlKHRydWUpO1xuICAgIHJldHVybiBuZXcgVWludDhBcnJheShidWZmZXIpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuT2JqZWN0SUQpIHtcbiAgICByZXR1cm4gbmV3IE1vbmdvLk9iamVjdElEKGRvY3VtZW50LnRvSGV4U3RyaW5nKCkpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuRGVjaW1hbDEyOCkge1xuICAgIHJldHVybiBEZWNpbWFsKGRvY3VtZW50LnRvU3RyaW5nKCkpO1xuICB9XG4gIGlmIChkb2N1bWVudFtcIkVKU09OJHR5cGVcIl0gJiYgZG9jdW1lbnRbXCJFSlNPTiR2YWx1ZVwiXSAmJiBfLnNpemUoZG9jdW1lbnQpID09PSAyKSB7XG4gICAgcmV0dXJuIEVKU09OLmZyb21KU09OVmFsdWUocmVwbGFjZU5hbWVzKHVubWFrZU1vbmdvTGVnYWwsIGRvY3VtZW50KSk7XG4gIH1cbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgTW9uZ29EQi5UaW1lc3RhbXApIHtcbiAgICAvLyBGb3Igbm93LCB0aGUgTWV0ZW9yIHJlcHJlc2VudGF0aW9uIG9mIGEgTW9uZ28gdGltZXN0YW1wIHR5cGUgKG5vdCBhIGRhdGUhXG4gICAgLy8gdGhpcyBpcyBhIHdlaXJkIGludGVybmFsIHRoaW5nIHVzZWQgaW4gdGhlIG9wbG9nISkgaXMgdGhlIHNhbWUgYXMgdGhlXG4gICAgLy8gTW9uZ28gcmVwcmVzZW50YXRpb24uIFdlIG5lZWQgdG8gZG8gdGhpcyBleHBsaWNpdGx5IG9yIGVsc2Ugd2Ugd291bGQgZG8gYVxuICAgIC8vIHN0cnVjdHVyYWwgY2xvbmUgYW5kIGxvc2UgdGhlIHByb3RvdHlwZS5cbiAgICByZXR1cm4gZG9jdW1lbnQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbnZhciByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyA9IGZ1bmN0aW9uIChkb2N1bWVudCkge1xuICBpZiAoRUpTT04uaXNCaW5hcnkoZG9jdW1lbnQpKSB7XG4gICAgLy8gVGhpcyBkb2VzIG1vcmUgY29waWVzIHRoYW4gd2UnZCBsaWtlLCBidXQgaXMgbmVjZXNzYXJ5IGJlY2F1c2VcbiAgICAvLyBNb25nb0RCLkJTT04gb25seSBsb29rcyBsaWtlIGl0IHRha2VzIGEgVWludDhBcnJheSAoYW5kIGRvZXNuJ3QgYWN0dWFsbHlcbiAgICAvLyBzZXJpYWxpemUgaXQgY29ycmVjdGx5KS5cbiAgICByZXR1cm4gbmV3IE1vbmdvREIuQmluYXJ5KEJ1ZmZlci5mcm9tKGRvY3VtZW50KSk7XG4gIH1cbiAgaWYgKGRvY3VtZW50IGluc3RhbmNlb2YgTW9uZ29EQi5CaW5hcnkpIHtcbiAgICAgcmV0dXJuIGRvY3VtZW50O1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvLk9iamVjdElEKSB7XG4gICAgcmV0dXJuIG5ldyBNb25nb0RCLk9iamVjdElEKGRvY3VtZW50LnRvSGV4U3RyaW5nKCkpO1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIE1vbmdvREIuVGltZXN0YW1wKSB7XG4gICAgLy8gRm9yIG5vdywgdGhlIE1ldGVvciByZXByZXNlbnRhdGlvbiBvZiBhIE1vbmdvIHRpbWVzdGFtcCB0eXBlIChub3QgYSBkYXRlIVxuICAgIC8vIHRoaXMgaXMgYSB3ZWlyZCBpbnRlcm5hbCB0aGluZyB1c2VkIGluIHRoZSBvcGxvZyEpIGlzIHRoZSBzYW1lIGFzIHRoZVxuICAgIC8vIE1vbmdvIHJlcHJlc2VudGF0aW9uLiBXZSBuZWVkIHRvIGRvIHRoaXMgZXhwbGljaXRseSBvciBlbHNlIHdlIHdvdWxkIGRvIGFcbiAgICAvLyBzdHJ1Y3R1cmFsIGNsb25lIGFuZCBsb3NlIHRoZSBwcm90b3R5cGUuXG4gICAgcmV0dXJuIGRvY3VtZW50O1xuICB9XG4gIGlmIChkb2N1bWVudCBpbnN0YW5jZW9mIERlY2ltYWwpIHtcbiAgICByZXR1cm4gTW9uZ29EQi5EZWNpbWFsMTI4LmZyb21TdHJpbmcoZG9jdW1lbnQudG9TdHJpbmcoKSk7XG4gIH1cbiAgaWYgKEVKU09OLl9pc0N1c3RvbVR5cGUoZG9jdW1lbnQpKSB7XG4gICAgcmV0dXJuIHJlcGxhY2VOYW1lcyhtYWtlTW9uZ29MZWdhbCwgRUpTT04udG9KU09OVmFsdWUoZG9jdW1lbnQpKTtcbiAgfVxuICAvLyBJdCBpcyBub3Qgb3JkaW5hcmlseSBwb3NzaWJsZSB0byBzdGljayBkb2xsYXItc2lnbiBrZXlzIGludG8gbW9uZ29cbiAgLy8gc28gd2UgZG9uJ3QgYm90aGVyIGNoZWNraW5nIGZvciB0aGluZ3MgdGhhdCBuZWVkIGVzY2FwaW5nIGF0IHRoaXMgdGltZS5cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbnZhciByZXBsYWNlVHlwZXMgPSBmdW5jdGlvbiAoZG9jdW1lbnQsIGF0b21UcmFuc2Zvcm1lcikge1xuICBpZiAodHlwZW9mIGRvY3VtZW50ICE9PSAnb2JqZWN0JyB8fCBkb2N1bWVudCA9PT0gbnVsbClcbiAgICByZXR1cm4gZG9jdW1lbnQ7XG5cbiAgdmFyIHJlcGxhY2VkVG9wTGV2ZWxBdG9tID0gYXRvbVRyYW5zZm9ybWVyKGRvY3VtZW50KTtcbiAgaWYgKHJlcGxhY2VkVG9wTGV2ZWxBdG9tICE9PSB1bmRlZmluZWQpXG4gICAgcmV0dXJuIHJlcGxhY2VkVG9wTGV2ZWxBdG9tO1xuXG4gIHZhciByZXQgPSBkb2N1bWVudDtcbiAgXy5lYWNoKGRvY3VtZW50LCBmdW5jdGlvbiAodmFsLCBrZXkpIHtcbiAgICB2YXIgdmFsUmVwbGFjZWQgPSByZXBsYWNlVHlwZXModmFsLCBhdG9tVHJhbnNmb3JtZXIpO1xuICAgIGlmICh2YWwgIT09IHZhbFJlcGxhY2VkKSB7XG4gICAgICAvLyBMYXp5IGNsb25lLiBTaGFsbG93IGNvcHkuXG4gICAgICBpZiAocmV0ID09PSBkb2N1bWVudClcbiAgICAgICAgcmV0ID0gXy5jbG9uZShkb2N1bWVudCk7XG4gICAgICByZXRba2V5XSA9IHZhbFJlcGxhY2VkO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5cbk1vbmdvQ29ubmVjdGlvbiA9IGZ1bmN0aW9uICh1cmwsIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgc2VsZi5fb2JzZXJ2ZU11bHRpcGxleGVycyA9IHt9O1xuICBzZWxmLl9vbkZhaWxvdmVySG9vayA9IG5ldyBIb29rO1xuXG4gIGNvbnN0IHVzZXJPcHRpb25zID0ge1xuICAgIC4uLihNb25nby5fY29ubmVjdGlvbk9wdGlvbnMgfHwge30pLFxuICAgIC4uLihNZXRlb3Iuc2V0dGluZ3M/LnBhY2thZ2VzPy5tb25nbz8ub3B0aW9ucyB8fCB7fSlcbiAgfTtcblxuICB2YXIgbW9uZ29PcHRpb25zID0gT2JqZWN0LmFzc2lnbih7XG4gICAgaWdub3JlVW5kZWZpbmVkOiB0cnVlLFxuICB9LCB1c2VyT3B0aW9ucyk7XG5cblxuXG4gIC8vIEludGVybmFsbHkgdGhlIG9wbG9nIGNvbm5lY3Rpb25zIHNwZWNpZnkgdGhlaXIgb3duIG1heFBvb2xTaXplXG4gIC8vIHdoaWNoIHdlIGRvbid0IHdhbnQgdG8gb3ZlcndyaXRlIHdpdGggYW55IHVzZXIgZGVmaW5lZCB2YWx1ZVxuICBpZiAoXy5oYXMob3B0aW9ucywgJ21heFBvb2xTaXplJykpIHtcbiAgICAvLyBJZiB3ZSBqdXN0IHNldCB0aGlzIGZvciBcInNlcnZlclwiLCByZXBsU2V0IHdpbGwgb3ZlcnJpZGUgaXQuIElmIHdlIGp1c3RcbiAgICAvLyBzZXQgaXQgZm9yIHJlcGxTZXQsIGl0IHdpbGwgYmUgaWdub3JlZCBpZiB3ZSdyZSBub3QgdXNpbmcgYSByZXBsU2V0LlxuICAgIG1vbmdvT3B0aW9ucy5tYXhQb29sU2l6ZSA9IG9wdGlvbnMubWF4UG9vbFNpemU7XG4gIH1cblxuICAvLyBUcmFuc2Zvcm0gb3B0aW9ucyBsaWtlIFwidGxzQ0FGaWxlQXNzZXRcIjogXCJmaWxlbmFtZS5wZW1cIiBpbnRvXG4gIC8vIFwidGxzQ0FGaWxlXCI6IFwiLzxmdWxscGF0aD4vZmlsZW5hbWUucGVtXCJcbiAgT2JqZWN0LmVudHJpZXMobW9uZ29PcHRpb25zIHx8IHt9KVxuICAgIC5maWx0ZXIoKFtrZXldKSA9PiBrZXkgJiYga2V5LmVuZHNXaXRoKEZJTEVfQVNTRVRfU1VGRklYKSlcbiAgICAuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICBjb25zdCBvcHRpb25OYW1lID0ga2V5LnJlcGxhY2UoRklMRV9BU1NFVF9TVUZGSVgsICcnKTtcbiAgICAgIG1vbmdvT3B0aW9uc1tvcHRpb25OYW1lXSA9IHBhdGguam9pbihBc3NldHMuZ2V0U2VydmVyRGlyKCksXG4gICAgICAgIEFTU0VUU19GT0xERVIsIEFQUF9GT0xERVIsIHZhbHVlKTtcbiAgICAgIGRlbGV0ZSBtb25nb09wdGlvbnNba2V5XTtcbiAgICB9KTtcblxuICBzZWxmLmRiID0gbnVsbDtcbiAgc2VsZi5fb3Bsb2dIYW5kbGUgPSBudWxsO1xuICBzZWxmLl9kb2NGZXRjaGVyID0gbnVsbDtcblxuICBzZWxmLmNsaWVudCA9IG5ldyBNb25nb0RCLk1vbmdvQ2xpZW50KHVybCwgbW9uZ29PcHRpb25zKTtcbiAgc2VsZi5kYiA9IHNlbGYuY2xpZW50LmRiKCk7XG5cbiAgc2VsZi5jbGllbnQub24oJ3NlcnZlckRlc2NyaXB0aW9uQ2hhbmdlZCcsIE1ldGVvci5iaW5kRW52aXJvbm1lbnQoZXZlbnQgPT4ge1xuICAgIC8vIFdoZW4gdGhlIGNvbm5lY3Rpb24gaXMgbm8gbG9uZ2VyIGFnYWluc3QgdGhlIHByaW1hcnkgbm9kZSwgZXhlY3V0ZSBhbGxcbiAgICAvLyBmYWlsb3ZlciBob29rcy4gVGhpcyBpcyBpbXBvcnRhbnQgZm9yIHRoZSBkcml2ZXIgYXMgaXQgaGFzIHRvIHJlLXBvb2wgdGhlXG4gICAgLy8gcXVlcnkgd2hlbiBpdCBoYXBwZW5zLlxuICAgIGlmIChcbiAgICAgIGV2ZW50LnByZXZpb3VzRGVzY3JpcHRpb24udHlwZSAhPT0gJ1JTUHJpbWFyeScgJiZcbiAgICAgIGV2ZW50Lm5ld0Rlc2NyaXB0aW9uLnR5cGUgPT09ICdSU1ByaW1hcnknXG4gICAgKSB7XG4gICAgICBzZWxmLl9vbkZhaWxvdmVySG9vay5lYWNoKGNhbGxiYWNrID0+IHtcbiAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pKTtcblxuICBpZiAob3B0aW9ucy5vcGxvZ1VybCAmJiAhIFBhY2thZ2VbJ2Rpc2FibGUtb3Bsb2cnXSkge1xuICAgIHNlbGYuX29wbG9nSGFuZGxlID0gbmV3IE9wbG9nSGFuZGxlKG9wdGlvbnMub3Bsb2dVcmwsIHNlbGYuZGIuZGF0YWJhc2VOYW1lKTtcbiAgICBzZWxmLl9kb2NGZXRjaGVyID0gbmV3IERvY0ZldGNoZXIoc2VsZik7XG4gIH1cbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmICghIHNlbGYuZGIpXG4gICAgdGhyb3cgRXJyb3IoXCJjbG9zZSBjYWxsZWQgYmVmb3JlIENvbm5lY3Rpb24gY3JlYXRlZD9cIik7XG5cbiAgLy8gWFhYIHByb2JhYmx5IHVudGVzdGVkXG4gIHZhciBvcGxvZ0hhbmRsZSA9IHNlbGYuX29wbG9nSGFuZGxlO1xuICBzZWxmLl9vcGxvZ0hhbmRsZSA9IG51bGw7XG4gIGlmIChvcGxvZ0hhbmRsZSlcbiAgICBvcGxvZ0hhbmRsZS5zdG9wKCk7XG5cbiAgLy8gVXNlIEZ1dHVyZS53cmFwIHNvIHRoYXQgZXJyb3JzIGdldCB0aHJvd24uIFRoaXMgaGFwcGVucyB0b1xuICAvLyB3b3JrIGV2ZW4gb3V0c2lkZSBhIGZpYmVyIHNpbmNlIHRoZSAnY2xvc2UnIG1ldGhvZCBpcyBub3RcbiAgLy8gYWN0dWFsbHkgYXN5bmNocm9ub3VzLlxuICBGdXR1cmUud3JhcChfLmJpbmQoc2VsZi5jbGllbnQuY2xvc2UsIHNlbGYuY2xpZW50KSkodHJ1ZSkud2FpdCgpO1xufTtcblxuLy8gUmV0dXJucyB0aGUgTW9uZ28gQ29sbGVjdGlvbiBvYmplY3Q7IG1heSB5aWVsZC5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUucmF3Q29sbGVjdGlvbiA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uTmFtZSkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKCEgc2VsZi5kYilcbiAgICB0aHJvdyBFcnJvcihcInJhd0NvbGxlY3Rpb24gY2FsbGVkIGJlZm9yZSBDb25uZWN0aW9uIGNyZWF0ZWQ/XCIpO1xuXG4gIHJldHVybiBzZWxmLmRiLmNvbGxlY3Rpb24oY29sbGVjdGlvbk5hbWUpO1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5fY3JlYXRlQ2FwcGVkQ29sbGVjdGlvbiA9IGZ1bmN0aW9uIChcbiAgICBjb2xsZWN0aW9uTmFtZSwgYnl0ZVNpemUsIG1heERvY3VtZW50cykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKCEgc2VsZi5kYilcbiAgICB0aHJvdyBFcnJvcihcIl9jcmVhdGVDYXBwZWRDb2xsZWN0aW9uIGNhbGxlZCBiZWZvcmUgQ29ubmVjdGlvbiBjcmVhdGVkP1wiKTtcblxuXG4gIHZhciBmdXR1cmUgPSBuZXcgRnV0dXJlKCk7XG4gIHNlbGYuZGIuY3JlYXRlQ29sbGVjdGlvbihcbiAgICBjb2xsZWN0aW9uTmFtZSxcbiAgICB7IGNhcHBlZDogdHJ1ZSwgc2l6ZTogYnl0ZVNpemUsIG1heDogbWF4RG9jdW1lbnRzIH0sXG4gICAgZnV0dXJlLnJlc29sdmVyKCkpO1xuICBmdXR1cmUud2FpdCgpO1xufTtcblxuLy8gVGhpcyBzaG91bGQgYmUgY2FsbGVkIHN5bmNocm9ub3VzbHkgd2l0aCBhIHdyaXRlLCB0byBjcmVhdGUgYVxuLy8gdHJhbnNhY3Rpb24gb24gdGhlIGN1cnJlbnQgd3JpdGUgZmVuY2UsIGlmIGFueS4gQWZ0ZXIgd2UgY2FuIHJlYWRcbi8vIHRoZSB3cml0ZSwgYW5kIGFmdGVyIG9ic2VydmVycyBoYXZlIGJlZW4gbm90aWZpZWQgKG9yIGF0IGxlYXN0LFxuLy8gYWZ0ZXIgdGhlIG9ic2VydmVyIG5vdGlmaWVycyBoYXZlIGFkZGVkIHRoZW1zZWx2ZXMgdG8gdGhlIHdyaXRlXG4vLyBmZW5jZSksIHlvdSBzaG91bGQgY2FsbCAnY29tbWl0dGVkKCknIG9uIHRoZSBvYmplY3QgcmV0dXJuZWQuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl9tYXliZUJlZ2luV3JpdGUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBmZW5jZSA9IEREUFNlcnZlci5fQ3VycmVudFdyaXRlRmVuY2UuZ2V0KCk7XG4gIGlmIChmZW5jZSkge1xuICAgIHJldHVybiBmZW5jZS5iZWdpbldyaXRlKCk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHtjb21taXR0ZWQ6IGZ1bmN0aW9uICgpIHt9fTtcbiAgfVxufTtcblxuLy8gSW50ZXJuYWwgaW50ZXJmYWNlOiBhZGRzIGEgY2FsbGJhY2sgd2hpY2ggaXMgY2FsbGVkIHdoZW4gdGhlIE1vbmdvIHByaW1hcnlcbi8vIGNoYW5nZXMuIFJldHVybnMgYSBzdG9wIGhhbmRsZS5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX29uRmFpbG92ZXIgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgcmV0dXJuIHRoaXMuX29uRmFpbG92ZXJIb29rLnJlZ2lzdGVyKGNhbGxiYWNrKTtcbn07XG5cblxuLy8vLy8vLy8vLy8vIFB1YmxpYyBBUEkgLy8vLy8vLy8vL1xuXG4vLyBUaGUgd3JpdGUgbWV0aG9kcyBibG9jayB1bnRpbCB0aGUgZGF0YWJhc2UgaGFzIGNvbmZpcm1lZCB0aGUgd3JpdGUgKGl0IG1heVxuLy8gbm90IGJlIHJlcGxpY2F0ZWQgb3Igc3RhYmxlIG9uIGRpc2ssIGJ1dCBvbmUgc2VydmVyIGhhcyBjb25maXJtZWQgaXQpIGlmIG5vXG4vLyBjYWxsYmFjayBpcyBwcm92aWRlZC4gSWYgYSBjYWxsYmFjayBpcyBwcm92aWRlZCwgdGhlbiB0aGV5IGNhbGwgdGhlIGNhbGxiYWNrXG4vLyB3aGVuIHRoZSB3cml0ZSBpcyBjb25maXJtZWQuIFRoZXkgcmV0dXJuIG5vdGhpbmcgb24gc3VjY2VzcywgYW5kIHJhaXNlIGFuXG4vLyBleGNlcHRpb24gb24gZmFpbHVyZS5cbi8vXG4vLyBBZnRlciBtYWtpbmcgYSB3cml0ZSAod2l0aCBpbnNlcnQsIHVwZGF0ZSwgcmVtb3ZlKSwgb2JzZXJ2ZXJzIGFyZVxuLy8gbm90aWZpZWQgYXN5bmNocm9ub3VzbHkuIElmIHlvdSB3YW50IHRvIHJlY2VpdmUgYSBjYWxsYmFjayBvbmNlIGFsbFxuLy8gb2YgdGhlIG9ic2VydmVyIG5vdGlmaWNhdGlvbnMgaGF2ZSBsYW5kZWQgZm9yIHlvdXIgd3JpdGUsIGRvIHRoZVxuLy8gd3JpdGVzIGluc2lkZSBhIHdyaXRlIGZlbmNlIChzZXQgRERQU2VydmVyLl9DdXJyZW50V3JpdGVGZW5jZSB0byBhIG5ld1xuLy8gX1dyaXRlRmVuY2UsIGFuZCB0aGVuIHNldCBhIGNhbGxiYWNrIG9uIHRoZSB3cml0ZSBmZW5jZS4pXG4vL1xuLy8gU2luY2Ugb3VyIGV4ZWN1dGlvbiBlbnZpcm9ubWVudCBpcyBzaW5nbGUtdGhyZWFkZWQsIHRoaXMgaXNcbi8vIHdlbGwtZGVmaW5lZCAtLSBhIHdyaXRlIFwiaGFzIGJlZW4gbWFkZVwiIGlmIGl0J3MgcmV0dXJuZWQsIGFuZCBhblxuLy8gb2JzZXJ2ZXIgXCJoYXMgYmVlbiBub3RpZmllZFwiIGlmIGl0cyBjYWxsYmFjayBoYXMgcmV0dXJuZWQuXG5cbnZhciB3cml0ZUNhbGxiYWNrID0gZnVuY3Rpb24gKHdyaXRlLCByZWZyZXNoLCBjYWxsYmFjaykge1xuICByZXR1cm4gZnVuY3Rpb24gKGVyciwgcmVzdWx0KSB7XG4gICAgaWYgKCEgZXJyKSB7XG4gICAgICAvLyBYWFggV2UgZG9uJ3QgaGF2ZSB0byBydW4gdGhpcyBvbiBlcnJvciwgcmlnaHQ/XG4gICAgICB0cnkge1xuICAgICAgICByZWZyZXNoKCk7XG4gICAgICB9IGNhdGNoIChyZWZyZXNoRXJyKSB7XG4gICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgIGNhbGxiYWNrKHJlZnJlc2hFcnIpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyByZWZyZXNoRXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHdyaXRlLmNvbW1pdHRlZCgpO1xuICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgY2FsbGJhY2soZXJyLCByZXN1bHQpO1xuICAgIH0gZWxzZSBpZiAoZXJyKSB7XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9O1xufTtcblxudmFyIGJpbmRFbnZpcm9ubWVudEZvcldyaXRlID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gIHJldHVybiBNZXRlb3IuYmluZEVudmlyb25tZW50KGNhbGxiYWNrLCBcIk1vbmdvIHdyaXRlXCIpO1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5faW5zZXJ0ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25fbmFtZSwgZG9jdW1lbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2spIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIHZhciBzZW5kRXJyb3IgPSBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChjYWxsYmFjaylcbiAgICAgIHJldHVybiBjYWxsYmFjayhlKTtcbiAgICB0aHJvdyBlO1xuICB9O1xuXG4gIGlmIChjb2xsZWN0aW9uX25hbWUgPT09IFwiX19fbWV0ZW9yX2ZhaWx1cmVfdGVzdF9jb2xsZWN0aW9uXCIpIHtcbiAgICB2YXIgZSA9IG5ldyBFcnJvcihcIkZhaWx1cmUgdGVzdFwiKTtcbiAgICBlLl9leHBlY3RlZEJ5VGVzdCA9IHRydWU7XG4gICAgc2VuZEVycm9yKGUpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghKExvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdChkb2N1bWVudCkgJiZcbiAgICAgICAgIUVKU09OLl9pc0N1c3RvbVR5cGUoZG9jdW1lbnQpKSkge1xuICAgIHNlbmRFcnJvcihuZXcgRXJyb3IoXG4gICAgICBcIk9ubHkgcGxhaW4gb2JqZWN0cyBtYXkgYmUgaW5zZXJ0ZWQgaW50byBNb25nb0RCXCIpKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgd3JpdGUgPSBzZWxmLl9tYXliZUJlZ2luV3JpdGUoKTtcbiAgdmFyIHJlZnJlc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgTWV0ZW9yLnJlZnJlc2goe2NvbGxlY3Rpb246IGNvbGxlY3Rpb25fbmFtZSwgaWQ6IGRvY3VtZW50Ll9pZCB9KTtcbiAgfTtcbiAgY2FsbGJhY2sgPSBiaW5kRW52aXJvbm1lbnRGb3JXcml0ZSh3cml0ZUNhbGxiYWNrKHdyaXRlLCByZWZyZXNoLCBjYWxsYmFjaykpO1xuICB0cnkge1xuICAgIHZhciBjb2xsZWN0aW9uID0gc2VsZi5yYXdDb2xsZWN0aW9uKGNvbGxlY3Rpb25fbmFtZSk7XG4gICAgY29sbGVjdGlvbi5pbnNlcnRPbmUoXG4gICAgICByZXBsYWNlVHlwZXMoZG9jdW1lbnQsIHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvKSxcbiAgICAgIHtcbiAgICAgICAgc2FmZTogdHJ1ZSxcbiAgICAgIH1cbiAgICApLnRoZW4oKHtpbnNlcnRlZElkfSkgPT4ge1xuICAgICAgY2FsbGJhY2sobnVsbCwgaW5zZXJ0ZWRJZCk7XG4gICAgfSkuY2F0Y2goKGUpID0+IHtcbiAgICAgIGNhbGxiYWNrKGUsIG51bGwpXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHdyaXRlLmNvbW1pdHRlZCgpO1xuICAgIHRocm93IGVycjtcbiAgfVxufTtcblxuLy8gQ2F1c2UgcXVlcmllcyB0aGF0IG1heSBiZSBhZmZlY3RlZCBieSB0aGUgc2VsZWN0b3IgdG8gcG9sbCBpbiB0aGlzIHdyaXRlXG4vLyBmZW5jZS5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX3JlZnJlc2ggPSBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIHNlbGVjdG9yKSB7XG4gIHZhciByZWZyZXNoS2V5ID0ge2NvbGxlY3Rpb246IGNvbGxlY3Rpb25OYW1lfTtcbiAgLy8gSWYgd2Uga25vdyB3aGljaCBkb2N1bWVudHMgd2UncmUgcmVtb3ZpbmcsIGRvbid0IHBvbGwgcXVlcmllcyB0aGF0IGFyZVxuICAvLyBzcGVjaWZpYyB0byBvdGhlciBkb2N1bWVudHMuIChOb3RlIHRoYXQgbXVsdGlwbGUgbm90aWZpY2F0aW9ucyBoZXJlIHNob3VsZFxuICAvLyBub3QgY2F1c2UgbXVsdGlwbGUgcG9sbHMsIHNpbmNlIGFsbCBvdXIgbGlzdGVuZXIgaXMgZG9pbmcgaXMgZW5xdWV1ZWluZyBhXG4gIC8vIHBvbGwuKVxuICB2YXIgc3BlY2lmaWNJZHMgPSBMb2NhbENvbGxlY3Rpb24uX2lkc01hdGNoZWRCeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgaWYgKHNwZWNpZmljSWRzKSB7XG4gICAgXy5lYWNoKHNwZWNpZmljSWRzLCBmdW5jdGlvbiAoaWQpIHtcbiAgICAgIE1ldGVvci5yZWZyZXNoKF8uZXh0ZW5kKHtpZDogaWR9LCByZWZyZXNoS2V5KSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgTWV0ZW9yLnJlZnJlc2gocmVmcmVzaEtleSk7XG4gIH1cbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX3JlbW92ZSA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uX25hbWUsIHNlbGVjdG9yLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAoY29sbGVjdGlvbl9uYW1lID09PSBcIl9fX21ldGVvcl9mYWlsdXJlX3Rlc3RfY29sbGVjdGlvblwiKSB7XG4gICAgdmFyIGUgPSBuZXcgRXJyb3IoXCJGYWlsdXJlIHRlc3RcIik7XG4gICAgZS5fZXhwZWN0ZWRCeVRlc3QgPSB0cnVlO1xuICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuXG4gIHZhciB3cml0ZSA9IHNlbGYuX21heWJlQmVnaW5Xcml0ZSgpO1xuICB2YXIgcmVmcmVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICBzZWxmLl9yZWZyZXNoKGNvbGxlY3Rpb25fbmFtZSwgc2VsZWN0b3IpO1xuICB9O1xuICBjYWxsYmFjayA9IGJpbmRFbnZpcm9ubWVudEZvcldyaXRlKHdyaXRlQ2FsbGJhY2sod3JpdGUsIHJlZnJlc2gsIGNhbGxiYWNrKSk7XG5cbiAgdHJ5IHtcbiAgICB2YXIgY29sbGVjdGlvbiA9IHNlbGYucmF3Q29sbGVjdGlvbihjb2xsZWN0aW9uX25hbWUpO1xuICAgIGNvbGxlY3Rpb25cbiAgICAgIC5kZWxldGVNYW55KHJlcGxhY2VUeXBlcyhzZWxlY3RvciwgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pLCB7XG4gICAgICAgIHNhZmU6IHRydWUsXG4gICAgICB9KVxuICAgICAgLnRoZW4oKHsgZGVsZXRlZENvdW50IH0pID0+IHtcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdHJhbnNmb3JtUmVzdWx0KHsgcmVzdWx0IDoge21vZGlmaWVkQ291bnQgOiBkZWxldGVkQ291bnR9IH0pLm51bWJlckFmZmVjdGVkKTtcbiAgICAgIH0pLmNhdGNoKChlcnIpID0+IHtcbiAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgfSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHdyaXRlLmNvbW1pdHRlZCgpO1xuICAgIHRocm93IGVycjtcbiAgfVxufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5fZHJvcENvbGxlY3Rpb24gPSBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIGNiKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuXG4gIHZhciB3cml0ZSA9IHNlbGYuX21heWJlQmVnaW5Xcml0ZSgpO1xuICB2YXIgcmVmcmVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICBNZXRlb3IucmVmcmVzaCh7Y29sbGVjdGlvbjogY29sbGVjdGlvbk5hbWUsIGlkOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBkcm9wQ29sbGVjdGlvbjogdHJ1ZX0pO1xuICB9O1xuXG5cbiAgY2IgPSBiaW5kRW52aXJvbm1lbnRGb3JXcml0ZSh3cml0ZUNhbGxiYWNrKHdyaXRlLCByZWZyZXNoLCBjYikpO1xuXG4gIHRyeSB7XG4gICAgdmFyIGNvbGxlY3Rpb24gPSBzZWxmLnJhd0NvbGxlY3Rpb24oY29sbGVjdGlvbk5hbWUpO1xuICAgIGNvbGxlY3Rpb24uZHJvcChjYik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB3cml0ZS5jb21taXR0ZWQoKTtcbiAgICB0aHJvdyBlO1xuICB9XG59O1xuXG4vLyBGb3IgdGVzdGluZyBvbmx5LiAgU2xpZ2h0bHkgYmV0dGVyIHRoYW4gYGMucmF3RGF0YWJhc2UoKS5kcm9wRGF0YWJhc2UoKWBcbi8vIGJlY2F1c2UgaXQgbGV0cyB0aGUgdGVzdCdzIGZlbmNlIHdhaXQgZm9yIGl0IHRvIGJlIGNvbXBsZXRlLlxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5fZHJvcERhdGFiYXNlID0gZnVuY3Rpb24gKGNiKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB2YXIgd3JpdGUgPSBzZWxmLl9tYXliZUJlZ2luV3JpdGUoKTtcbiAgdmFyIHJlZnJlc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgTWV0ZW9yLnJlZnJlc2goeyBkcm9wRGF0YWJhc2U6IHRydWUgfSk7XG4gIH07XG4gIGNiID0gYmluZEVudmlyb25tZW50Rm9yV3JpdGUod3JpdGVDYWxsYmFjayh3cml0ZSwgcmVmcmVzaCwgY2IpKTtcblxuICB0cnkge1xuICAgIHNlbGYuZGIuZHJvcERhdGFiYXNlKGNiKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHdyaXRlLmNvbW1pdHRlZCgpO1xuICAgIHRocm93IGU7XG4gIH1cbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX3VwZGF0ZSA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uX25hbWUsIHNlbGVjdG9yLCBtb2QsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucywgY2FsbGJhY2spIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG5cblxuICBpZiAoISBjYWxsYmFjayAmJiBvcHRpb25zIGluc3RhbmNlb2YgRnVuY3Rpb24pIHtcbiAgICBjYWxsYmFjayA9IG9wdGlvbnM7XG4gICAgb3B0aW9ucyA9IG51bGw7XG4gIH1cblxuICBpZiAoY29sbGVjdGlvbl9uYW1lID09PSBcIl9fX21ldGVvcl9mYWlsdXJlX3Rlc3RfY29sbGVjdGlvblwiKSB7XG4gICAgdmFyIGUgPSBuZXcgRXJyb3IoXCJGYWlsdXJlIHRlc3RcIik7XG4gICAgZS5fZXhwZWN0ZWRCeVRlc3QgPSB0cnVlO1xuICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuXG4gIC8vIGV4cGxpY2l0IHNhZmV0eSBjaGVjay4gbnVsbCBhbmQgdW5kZWZpbmVkIGNhbiBjcmFzaCB0aGUgbW9uZ29cbiAgLy8gZHJpdmVyLiBBbHRob3VnaCB0aGUgbm9kZSBkcml2ZXIgYW5kIG1pbmltb25nbyBkbyAnc3VwcG9ydCdcbiAgLy8gbm9uLW9iamVjdCBtb2RpZmllciBpbiB0aGF0IHRoZXkgZG9uJ3QgY3Jhc2gsIHRoZXkgYXJlIG5vdFxuICAvLyBtZWFuaW5nZnVsIG9wZXJhdGlvbnMgYW5kIGRvIG5vdCBkbyBhbnl0aGluZy4gRGVmZW5zaXZlbHkgdGhyb3cgYW5cbiAgLy8gZXJyb3IgaGVyZS5cbiAgaWYgKCFtb2QgfHwgdHlwZW9mIG1vZCAhPT0gJ29iamVjdCcpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBtb2RpZmllci4gTW9kaWZpZXIgbXVzdCBiZSBhbiBvYmplY3QuXCIpO1xuXG4gIGlmICghKExvY2FsQ29sbGVjdGlvbi5faXNQbGFpbk9iamVjdChtb2QpICYmXG4gICAgICAgICFFSlNPTi5faXNDdXN0b21UeXBlKG1vZCkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJPbmx5IHBsYWluIG9iamVjdHMgbWF5IGJlIHVzZWQgYXMgcmVwbGFjZW1lbnRcIiArXG4gICAgICAgIFwiIGRvY3VtZW50cyBpbiBNb25nb0RCXCIpO1xuICB9XG5cbiAgaWYgKCFvcHRpb25zKSBvcHRpb25zID0ge307XG5cbiAgdmFyIHdyaXRlID0gc2VsZi5fbWF5YmVCZWdpbldyaXRlKCk7XG4gIHZhciByZWZyZXNoID0gZnVuY3Rpb24gKCkge1xuICAgIHNlbGYuX3JlZnJlc2goY29sbGVjdGlvbl9uYW1lLCBzZWxlY3Rvcik7XG4gIH07XG4gIGNhbGxiYWNrID0gd3JpdGVDYWxsYmFjayh3cml0ZSwgcmVmcmVzaCwgY2FsbGJhY2spO1xuICB0cnkge1xuICAgIHZhciBjb2xsZWN0aW9uID0gc2VsZi5yYXdDb2xsZWN0aW9uKGNvbGxlY3Rpb25fbmFtZSk7XG4gICAgdmFyIG1vbmdvT3B0cyA9IHtzYWZlOiB0cnVlfTtcbiAgICAvLyBBZGQgc3VwcG9ydCBmb3IgZmlsdGVyZWQgcG9zaXRpb25hbCBvcGVyYXRvclxuICAgIGlmIChvcHRpb25zLmFycmF5RmlsdGVycyAhPT0gdW5kZWZpbmVkKSBtb25nb09wdHMuYXJyYXlGaWx0ZXJzID0gb3B0aW9ucy5hcnJheUZpbHRlcnM7XG4gICAgLy8gZXhwbGljdGx5IGVudW1lcmF0ZSBvcHRpb25zIHRoYXQgbWluaW1vbmdvIHN1cHBvcnRzXG4gICAgaWYgKG9wdGlvbnMudXBzZXJ0KSBtb25nb09wdHMudXBzZXJ0ID0gdHJ1ZTtcbiAgICBpZiAob3B0aW9ucy5tdWx0aSkgbW9uZ29PcHRzLm11bHRpID0gdHJ1ZTtcbiAgICAvLyBMZXRzIHlvdSBnZXQgYSBtb3JlIG1vcmUgZnVsbCByZXN1bHQgZnJvbSBNb25nb0RCLiBVc2Ugd2l0aCBjYXV0aW9uOlxuICAgIC8vIG1pZ2h0IG5vdCB3b3JrIHdpdGggQy51cHNlcnQgKGFzIG9wcG9zZWQgdG8gQy51cGRhdGUoe3Vwc2VydDp0cnVlfSkgb3JcbiAgICAvLyB3aXRoIHNpbXVsYXRlZCB1cHNlcnQuXG4gICAgaWYgKG9wdGlvbnMuZnVsbFJlc3VsdCkgbW9uZ29PcHRzLmZ1bGxSZXN1bHQgPSB0cnVlO1xuXG4gICAgdmFyIG1vbmdvU2VsZWN0b3IgPSByZXBsYWNlVHlwZXMoc2VsZWN0b3IsIHJlcGxhY2VNZXRlb3JBdG9tV2l0aE1vbmdvKTtcbiAgICB2YXIgbW9uZ29Nb2QgPSByZXBsYWNlVHlwZXMobW9kLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyk7XG5cbiAgICB2YXIgaXNNb2RpZnkgPSBMb2NhbENvbGxlY3Rpb24uX2lzTW9kaWZpY2F0aW9uTW9kKG1vbmdvTW9kKTtcblxuICAgIGlmIChvcHRpb25zLl9mb3JiaWRSZXBsYWNlICYmICFpc01vZGlmeSkge1xuICAgICAgdmFyIGVyciA9IG5ldyBFcnJvcihcIkludmFsaWQgbW9kaWZpZXIuIFJlcGxhY2VtZW50cyBhcmUgZm9yYmlkZGVuLlwiKTtcbiAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBXZSd2ZSBhbHJlYWR5IHJ1biByZXBsYWNlVHlwZXMvcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28gb25cbiAgICAvLyBzZWxlY3RvciBhbmQgbW9kLiAgV2UgYXNzdW1lIGl0IGRvZXNuJ3QgbWF0dGVyLCBhcyBmYXIgYXNcbiAgICAvLyB0aGUgYmVoYXZpb3Igb2YgbW9kaWZpZXJzIGlzIGNvbmNlcm5lZCwgd2hldGhlciBgX21vZGlmeWBcbiAgICAvLyBpcyBydW4gb24gRUpTT04gb3Igb24gbW9uZ28tY29udmVydGVkIEVKU09OLlxuXG4gICAgLy8gUnVuIHRoaXMgY29kZSB1cCBmcm9udCBzbyB0aGF0IGl0IGZhaWxzIGZhc3QgaWYgc29tZW9uZSB1c2VzXG4gICAgLy8gYSBNb25nbyB1cGRhdGUgb3BlcmF0b3Igd2UgZG9uJ3Qgc3VwcG9ydC5cbiAgICBsZXQga25vd25JZDtcbiAgICBpZiAob3B0aW9ucy51cHNlcnQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGxldCBuZXdEb2MgPSBMb2NhbENvbGxlY3Rpb24uX2NyZWF0ZVVwc2VydERvY3VtZW50KHNlbGVjdG9yLCBtb2QpO1xuICAgICAgICBrbm93bklkID0gbmV3RG9jLl9pZDtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAob3B0aW9ucy51cHNlcnQgJiZcbiAgICAgICAgISBpc01vZGlmeSAmJlxuICAgICAgICAhIGtub3duSWQgJiZcbiAgICAgICAgb3B0aW9ucy5pbnNlcnRlZElkICYmXG4gICAgICAgICEgKG9wdGlvbnMuaW5zZXJ0ZWRJZCBpbnN0YW5jZW9mIE1vbmdvLk9iamVjdElEICYmXG4gICAgICAgICAgIG9wdGlvbnMuZ2VuZXJhdGVkSWQpKSB7XG4gICAgICAvLyBJbiBjYXNlIG9mIGFuIHVwc2VydCB3aXRoIGEgcmVwbGFjZW1lbnQsIHdoZXJlIHRoZXJlIGlzIG5vIF9pZCBkZWZpbmVkXG4gICAgICAvLyBpbiBlaXRoZXIgdGhlIHF1ZXJ5IG9yIHRoZSByZXBsYWNlbWVudCBkb2MsIG1vbmdvIHdpbGwgZ2VuZXJhdGUgYW4gaWQgaXRzZWxmLlxuICAgICAgLy8gVGhlcmVmb3JlIHdlIG5lZWQgdGhpcyBzcGVjaWFsIHN0cmF0ZWd5IGlmIHdlIHdhbnQgdG8gY29udHJvbCB0aGUgaWQgb3Vyc2VsdmVzLlxuXG4gICAgICAvLyBXZSBkb24ndCBuZWVkIHRvIGRvIHRoaXMgd2hlbjpcbiAgICAgIC8vIC0gVGhpcyBpcyBub3QgYSByZXBsYWNlbWVudCwgc28gd2UgY2FuIGFkZCBhbiBfaWQgdG8gJHNldE9uSW5zZXJ0XG4gICAgICAvLyAtIFRoZSBpZCBpcyBkZWZpbmVkIGJ5IHF1ZXJ5IG9yIG1vZCB3ZSBjYW4ganVzdCBhZGQgaXQgdG8gdGhlIHJlcGxhY2VtZW50IGRvY1xuICAgICAgLy8gLSBUaGUgdXNlciBkaWQgbm90IHNwZWNpZnkgYW55IGlkIHByZWZlcmVuY2UgYW5kIHRoZSBpZCBpcyBhIE1vbmdvIE9iamVjdElkLFxuICAgICAgLy8gICAgIHRoZW4gd2UgY2FuIGp1c3QgbGV0IE1vbmdvIGdlbmVyYXRlIHRoZSBpZFxuXG4gICAgICBzaW11bGF0ZVVwc2VydFdpdGhJbnNlcnRlZElkKFxuICAgICAgICBjb2xsZWN0aW9uLCBtb25nb1NlbGVjdG9yLCBtb25nb01vZCwgb3B0aW9ucyxcbiAgICAgICAgLy8gVGhpcyBjYWxsYmFjayBkb2VzIG5vdCBuZWVkIHRvIGJlIGJpbmRFbnZpcm9ubWVudCdlZCBiZWNhdXNlXG4gICAgICAgIC8vIHNpbXVsYXRlVXBzZXJ0V2l0aEluc2VydGVkSWQoKSB3cmFwcyBpdCBhbmQgdGhlbiBwYXNzZXMgaXQgdGhyb3VnaFxuICAgICAgICAvLyBiaW5kRW52aXJvbm1lbnRGb3JXcml0ZS5cbiAgICAgICAgZnVuY3Rpb24gKGVycm9yLCByZXN1bHQpIHtcbiAgICAgICAgICAvLyBJZiB3ZSBnb3QgaGVyZSB2aWEgYSB1cHNlcnQoKSBjYWxsLCB0aGVuIG9wdGlvbnMuX3JldHVybk9iamVjdCB3aWxsXG4gICAgICAgICAgLy8gYmUgc2V0IGFuZCB3ZSBzaG91bGQgcmV0dXJuIHRoZSB3aG9sZSBvYmplY3QuIE90aGVyd2lzZSwgd2Ugc2hvdWxkXG4gICAgICAgICAgLy8ganVzdCByZXR1cm4gdGhlIG51bWJlciBvZiBhZmZlY3RlZCBkb2NzIHRvIG1hdGNoIHRoZSBtb25nbyBBUEkuXG4gICAgICAgICAgaWYgKHJlc3VsdCAmJiAhIG9wdGlvbnMuX3JldHVybk9iamVjdCkge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyb3IsIHJlc3VsdC5udW1iZXJBZmZlY3RlZCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yLCByZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuXG4gICAgICBpZiAob3B0aW9ucy51cHNlcnQgJiYgIWtub3duSWQgJiYgb3B0aW9ucy5pbnNlcnRlZElkICYmIGlzTW9kaWZ5KSB7XG4gICAgICAgIGlmICghbW9uZ29Nb2QuaGFzT3duUHJvcGVydHkoJyRzZXRPbkluc2VydCcpKSB7XG4gICAgICAgICAgbW9uZ29Nb2QuJHNldE9uSW5zZXJ0ID0ge307XG4gICAgICAgIH1cbiAgICAgICAga25vd25JZCA9IG9wdGlvbnMuaW5zZXJ0ZWRJZDtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihtb25nb01vZC4kc2V0T25JbnNlcnQsIHJlcGxhY2VUeXBlcyh7X2lkOiBvcHRpb25zLmluc2VydGVkSWR9LCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbykpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdHJpbmdzID0gT2JqZWN0LmtleXMobW9uZ29Nb2QpLmZpbHRlcigoa2V5KSA9PiAha2V5LnN0YXJ0c1dpdGgoXCIkXCIpKTtcbiAgICAgIGxldCB1cGRhdGVNZXRob2QgPSBzdHJpbmdzLmxlbmd0aCA+IDAgPyAncmVwbGFjZU9uZScgOiAndXBkYXRlTWFueSc7XG4gICAgICB1cGRhdGVNZXRob2QgPVxuICAgICAgICB1cGRhdGVNZXRob2QgPT09ICd1cGRhdGVNYW55JyAmJiAhbW9uZ29PcHRzLm11bHRpXG4gICAgICAgICAgPyAndXBkYXRlT25lJ1xuICAgICAgICAgIDogdXBkYXRlTWV0aG9kO1xuICAgICAgY29sbGVjdGlvblt1cGRhdGVNZXRob2RdLmJpbmQoY29sbGVjdGlvbikoXG4gICAgICAgIG1vbmdvU2VsZWN0b3IsIG1vbmdvTW9kLCBtb25nb09wdHMsXG4gICAgICAgICAgLy8gbW9uZ28gZHJpdmVyIG5vdyByZXR1cm5zIHVuZGVmaW5lZCBmb3IgZXJyIGluIHRoZSBjYWxsYmFja1xuICAgICAgICAgIGJpbmRFbnZpcm9ubWVudEZvcldyaXRlKGZ1bmN0aW9uIChlcnIgPSBudWxsLCByZXN1bHQpIHtcbiAgICAgICAgICBpZiAoISBlcnIpIHtcbiAgICAgICAgICAgIHZhciBtZXRlb3JSZXN1bHQgPSB0cmFuc2Zvcm1SZXN1bHQoe3Jlc3VsdH0pO1xuICAgICAgICAgICAgaWYgKG1ldGVvclJlc3VsdCAmJiBvcHRpb25zLl9yZXR1cm5PYmplY3QpIHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhpcyB3YXMgYW4gdXBzZXJ0KCkgY2FsbCwgYW5kIHdlIGVuZGVkIHVwXG4gICAgICAgICAgICAgIC8vIGluc2VydGluZyBhIG5ldyBkb2MgYW5kIHdlIGtub3cgaXRzIGlkLCB0aGVuXG4gICAgICAgICAgICAgIC8vIHJldHVybiB0aGF0IGlkIGFzIHdlbGwuXG4gICAgICAgICAgICAgIGlmIChvcHRpb25zLnVwc2VydCAmJiBtZXRlb3JSZXN1bHQuaW5zZXJ0ZWRJZCkge1xuICAgICAgICAgICAgICAgIGlmIChrbm93bklkKSB7XG4gICAgICAgICAgICAgICAgICBtZXRlb3JSZXN1bHQuaW5zZXJ0ZWRJZCA9IGtub3duSWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtZXRlb3JSZXN1bHQuaW5zZXJ0ZWRJZCBpbnN0YW5jZW9mIE1vbmdvREIuT2JqZWN0SUQpIHtcbiAgICAgICAgICAgICAgICAgIG1ldGVvclJlc3VsdC5pbnNlcnRlZElkID0gbmV3IE1vbmdvLk9iamVjdElEKG1ldGVvclJlc3VsdC5pbnNlcnRlZElkLnRvSGV4U3RyaW5nKCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgbWV0ZW9yUmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgbWV0ZW9yUmVzdWx0Lm51bWJlckFmZmVjdGVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB3cml0ZS5jb21taXR0ZWQoKTtcbiAgICB0aHJvdyBlO1xuICB9XG59O1xuXG52YXIgdHJhbnNmb3JtUmVzdWx0ID0gZnVuY3Rpb24gKGRyaXZlclJlc3VsdCkge1xuICB2YXIgbWV0ZW9yUmVzdWx0ID0geyBudW1iZXJBZmZlY3RlZDogMCB9O1xuICBpZiAoZHJpdmVyUmVzdWx0KSB7XG4gICAgdmFyIG1vbmdvUmVzdWx0ID0gZHJpdmVyUmVzdWx0LnJlc3VsdDtcbiAgICAvLyBPbiB1cGRhdGVzIHdpdGggdXBzZXJ0OnRydWUsIHRoZSBpbnNlcnRlZCB2YWx1ZXMgY29tZSBhcyBhIGxpc3Qgb2ZcbiAgICAvLyB1cHNlcnRlZCB2YWx1ZXMgLS0gZXZlbiB3aXRoIG9wdGlvbnMubXVsdGksIHdoZW4gdGhlIHVwc2VydCBkb2VzIGluc2VydCxcbiAgICAvLyBpdCBvbmx5IGluc2VydHMgb25lIGVsZW1lbnQuXG4gICAgaWYgKG1vbmdvUmVzdWx0LnVwc2VydGVkQ291bnQpIHtcbiAgICAgIG1ldGVvclJlc3VsdC5udW1iZXJBZmZlY3RlZCA9IG1vbmdvUmVzdWx0LnVwc2VydGVkQ291bnQ7XG5cbiAgICAgIGlmIChtb25nb1Jlc3VsdC51cHNlcnRlZElkKSB7XG4gICAgICAgIG1ldGVvclJlc3VsdC5pbnNlcnRlZElkID0gbW9uZ29SZXN1bHQudXBzZXJ0ZWRJZDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gbiB3YXMgdXNlZCBiZWZvcmUgTW9uZ28gNS4wLCBpbiBNb25nbyA1LjAgd2UgYXJlIG5vdCByZWNlaXZpbmcgdGhpcyBuXG4gICAgICAvLyBmaWVsZCBhbmQgc28gd2UgYXJlIHVzaW5nIG1vZGlmaWVkQ291bnQgaW5zdGVhZFxuICAgICAgbWV0ZW9yUmVzdWx0Lm51bWJlckFmZmVjdGVkID0gbW9uZ29SZXN1bHQubiB8fCBtb25nb1Jlc3VsdC5tYXRjaGVkQ291bnQgfHwgbW9uZ29SZXN1bHQubW9kaWZpZWRDb3VudDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbWV0ZW9yUmVzdWx0O1xufTtcblxuXG52YXIgTlVNX09QVElNSVNUSUNfVFJJRVMgPSAzO1xuXG4vLyBleHBvc2VkIGZvciB0ZXN0aW5nXG5Nb25nb0Nvbm5lY3Rpb24uX2lzQ2Fubm90Q2hhbmdlSWRFcnJvciA9IGZ1bmN0aW9uIChlcnIpIHtcblxuICAvLyBNb25nbyAzLjIuKiByZXR1cm5zIGVycm9yIGFzIG5leHQgT2JqZWN0OlxuICAvLyB7bmFtZTogU3RyaW5nLCBjb2RlOiBOdW1iZXIsIGVycm1zZzogU3RyaW5nfVxuICAvLyBPbGRlciBNb25nbyByZXR1cm5zOlxuICAvLyB7bmFtZTogU3RyaW5nLCBjb2RlOiBOdW1iZXIsIGVycjogU3RyaW5nfVxuICB2YXIgZXJyb3IgPSBlcnIuZXJybXNnIHx8IGVyci5lcnI7XG5cbiAgLy8gV2UgZG9uJ3QgdXNlIHRoZSBlcnJvciBjb2RlIGhlcmVcbiAgLy8gYmVjYXVzZSB0aGUgZXJyb3IgY29kZSB3ZSBvYnNlcnZlZCBpdCBwcm9kdWNpbmcgKDE2ODM3KSBhcHBlYXJzIHRvIGJlXG4gIC8vIGEgZmFyIG1vcmUgZ2VuZXJpYyBlcnJvciBjb2RlIGJhc2VkIG9uIGV4YW1pbmluZyB0aGUgc291cmNlLlxuICBpZiAoZXJyb3IuaW5kZXhPZignVGhlIF9pZCBmaWVsZCBjYW5ub3QgYmUgY2hhbmdlZCcpID09PSAwXG4gICAgfHwgZXJyb3IuaW5kZXhPZihcInRoZSAoaW1tdXRhYmxlKSBmaWVsZCAnX2lkJyB3YXMgZm91bmQgdG8gaGF2ZSBiZWVuIGFsdGVyZWQgdG8gX2lkXCIpICE9PSAtMSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxudmFyIHNpbXVsYXRlVXBzZXJ0V2l0aEluc2VydGVkSWQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgc2VsZWN0b3IsIG1vZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gIC8vIFNUUkFURUdZOiBGaXJzdCB0cnkgZG9pbmcgYW4gdXBzZXJ0IHdpdGggYSBnZW5lcmF0ZWQgSUQuXG4gIC8vIElmIHRoaXMgdGhyb3dzIGFuIGVycm9yIGFib3V0IGNoYW5naW5nIHRoZSBJRCBvbiBhbiBleGlzdGluZyBkb2N1bWVudFxuICAvLyB0aGVuIHdpdGhvdXQgYWZmZWN0aW5nIHRoZSBkYXRhYmFzZSwgd2Uga25vdyB3ZSBzaG91bGQgcHJvYmFibHkgdHJ5XG4gIC8vIGFuIHVwZGF0ZSB3aXRob3V0IHRoZSBnZW5lcmF0ZWQgSUQuIElmIGl0IGFmZmVjdGVkIDAgZG9jdW1lbnRzLFxuICAvLyB0aGVuIHdpdGhvdXQgYWZmZWN0aW5nIHRoZSBkYXRhYmFzZSwgd2UgdGhlIGRvY3VtZW50IHRoYXQgZmlyc3RcbiAgLy8gZ2F2ZSB0aGUgZXJyb3IgaXMgcHJvYmFibHkgcmVtb3ZlZCBhbmQgd2UgbmVlZCB0byB0cnkgYW4gaW5zZXJ0IGFnYWluXG4gIC8vIFdlIGdvIGJhY2sgdG8gc3RlcCBvbmUgYW5kIHJlcGVhdC5cbiAgLy8gTGlrZSBhbGwgXCJvcHRpbWlzdGljIHdyaXRlXCIgc2NoZW1lcywgd2UgcmVseSBvbiB0aGUgZmFjdCB0aGF0IGl0J3NcbiAgLy8gdW5saWtlbHkgb3VyIHdyaXRlcyB3aWxsIGNvbnRpbnVlIHRvIGJlIGludGVyZmVyZWQgd2l0aCB1bmRlciBub3JtYWxcbiAgLy8gY2lyY3Vtc3RhbmNlcyAodGhvdWdoIHN1ZmZpY2llbnRseSBoZWF2eSBjb250ZW50aW9uIHdpdGggd3JpdGVyc1xuICAvLyBkaXNhZ3JlZWluZyBvbiB0aGUgZXhpc3RlbmNlIG9mIGFuIG9iamVjdCB3aWxsIGNhdXNlIHdyaXRlcyB0byBmYWlsXG4gIC8vIGluIHRoZW9yeSkuXG5cbiAgdmFyIGluc2VydGVkSWQgPSBvcHRpb25zLmluc2VydGVkSWQ7IC8vIG11c3QgZXhpc3RcbiAgdmFyIG1vbmdvT3B0c0ZvclVwZGF0ZSA9IHtcbiAgICBzYWZlOiB0cnVlLFxuICAgIG11bHRpOiBvcHRpb25zLm11bHRpXG4gIH07XG4gIHZhciBtb25nb09wdHNGb3JJbnNlcnQgPSB7XG4gICAgc2FmZTogdHJ1ZSxcbiAgICB1cHNlcnQ6IHRydWVcbiAgfTtcblxuICB2YXIgcmVwbGFjZW1lbnRXaXRoSWQgPSBPYmplY3QuYXNzaWduKFxuICAgIHJlcGxhY2VUeXBlcyh7X2lkOiBpbnNlcnRlZElkfSwgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pLFxuICAgIG1vZCk7XG5cbiAgdmFyIHRyaWVzID0gTlVNX09QVElNSVNUSUNfVFJJRVM7XG5cbiAgdmFyIGRvVXBkYXRlID0gZnVuY3Rpb24gKCkge1xuICAgIHRyaWVzLS07XG4gICAgaWYgKCEgdHJpZXMpIHtcbiAgICAgIGNhbGxiYWNrKG5ldyBFcnJvcihcIlVwc2VydCBmYWlsZWQgYWZ0ZXIgXCIgKyBOVU1fT1BUSU1JU1RJQ19UUklFUyArIFwiIHRyaWVzLlwiKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxldCBtZXRob2QgPSBjb2xsZWN0aW9uLnVwZGF0ZU1hbnk7XG4gICAgICBpZighT2JqZWN0LmtleXMobW9kKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aChcIiRcIikpKXtcbiAgICAgICAgbWV0aG9kID0gY29sbGVjdGlvbi5yZXBsYWNlT25lLmJpbmQoY29sbGVjdGlvbik7XG4gICAgICB9XG4gICAgICBtZXRob2QoXG4gICAgICAgIHNlbGVjdG9yLFxuICAgICAgICBtb2QsXG4gICAgICAgIG1vbmdvT3B0c0ZvclVwZGF0ZSxcbiAgICAgICAgYmluZEVudmlyb25tZW50Rm9yV3JpdGUoZnVuY3Rpb24oZXJyLCByZXN1bHQpIHtcbiAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgIH0gZWxzZSBpZiAocmVzdWx0ICYmIChyZXN1bHQubW9kaWZpZWRDb3VudCB8fCByZXN1bHQudXBzZXJ0ZWRDb3VudCkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHtcbiAgICAgICAgICAgICAgbnVtYmVyQWZmZWN0ZWQ6IHJlc3VsdC5tb2RpZmllZENvdW50IHx8IHJlc3VsdC51cHNlcnRlZENvdW50LFxuICAgICAgICAgICAgICBpbnNlcnRlZElkOiByZXN1bHQudXBzZXJ0ZWRJZCB8fCB1bmRlZmluZWQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZG9Db25kaXRpb25hbEluc2VydCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICB9O1xuXG4gIHZhciBkb0NvbmRpdGlvbmFsSW5zZXJ0ID0gZnVuY3Rpb24oKSB7XG4gICAgY29sbGVjdGlvbi5yZXBsYWNlT25lKFxuICAgICAgc2VsZWN0b3IsXG4gICAgICByZXBsYWNlbWVudFdpdGhJZCxcbiAgICAgIG1vbmdvT3B0c0Zvckluc2VydCxcbiAgICAgIGJpbmRFbnZpcm9ubWVudEZvcldyaXRlKGZ1bmN0aW9uKGVyciwgcmVzdWx0KSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAvLyBmaWd1cmUgb3V0IGlmIHRoaXMgaXMgYVxuICAgICAgICAgIC8vIFwiY2Fubm90IGNoYW5nZSBfaWQgb2YgZG9jdW1lbnRcIiBlcnJvciwgYW5kXG4gICAgICAgICAgLy8gaWYgc28sIHRyeSBkb1VwZGF0ZSgpIGFnYWluLCB1cCB0byAzIHRpbWVzLlxuICAgICAgICAgIGlmIChNb25nb0Nvbm5lY3Rpb24uX2lzQ2Fubm90Q2hhbmdlSWRFcnJvcihlcnIpKSB7XG4gICAgICAgICAgICBkb1VwZGF0ZSgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYWxsYmFjayhudWxsLCB7XG4gICAgICAgICAgICBudW1iZXJBZmZlY3RlZDogcmVzdWx0LnVwc2VydGVkQ291bnQsXG4gICAgICAgICAgICBpbnNlcnRlZElkOiByZXN1bHQudXBzZXJ0ZWRJZCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICB9O1xuXG4gIGRvVXBkYXRlKCk7XG59O1xuXG5fLmVhY2goW1wiaW5zZXJ0XCIsIFwidXBkYXRlXCIsIFwicmVtb3ZlXCIsIFwiZHJvcENvbGxlY3Rpb25cIiwgXCJkcm9wRGF0YWJhc2VcIl0sIGZ1bmN0aW9uIChtZXRob2QpIHtcbiAgTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24gKC8qIGFyZ3VtZW50cyAqLykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gTWV0ZW9yLndyYXBBc3luYyhzZWxmW1wiX1wiICsgbWV0aG9kXSkuYXBwbHkoc2VsZiwgYXJndW1lbnRzKTtcbiAgfTtcbn0pO1xuXG4vLyBYWFggTW9uZ29Db25uZWN0aW9uLnVwc2VydCgpIGRvZXMgbm90IHJldHVybiB0aGUgaWQgb2YgdGhlIGluc2VydGVkIGRvY3VtZW50XG4vLyB1bmxlc3MgeW91IHNldCBpdCBleHBsaWNpdGx5IGluIHRoZSBzZWxlY3RvciBvciBtb2RpZmllciAoYXMgYSByZXBsYWNlbWVudFxuLy8gZG9jKS5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUudXBzZXJ0ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCBzZWxlY3RvciwgbW9kLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucywgY2FsbGJhY2spIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG5cbiAgXG4gIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gXCJmdW5jdGlvblwiICYmICEgY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IG9wdGlvbnM7XG4gICAgb3B0aW9ucyA9IHt9O1xuICB9XG5cbiAgcmV0dXJuIHNlbGYudXBkYXRlKGNvbGxlY3Rpb25OYW1lLCBzZWxlY3RvciwgbW9kLFxuICAgICAgICAgICAgICAgICAgICAgXy5leHRlbmQoe30sIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgdXBzZXJ0OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICBfcmV0dXJuT2JqZWN0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICB9KSwgY2FsbGJhY2spO1xufTtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5maW5kID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCBzZWxlY3Rvciwgb3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpXG4gICAgc2VsZWN0b3IgPSB7fTtcblxuICByZXR1cm4gbmV3IEN1cnNvcihcbiAgICBzZWxmLCBuZXcgQ3Vyc29yRGVzY3JpcHRpb24oY29sbGVjdGlvbk5hbWUsIHNlbGVjdG9yLCBvcHRpb25zKSk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmZpbmRPbmVBc3luYyA9IGFzeW5jIGZ1bmN0aW9uIChjb2xsZWN0aW9uX25hbWUsIHNlbGVjdG9yLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpXG4gICAgc2VsZWN0b3IgPSB7fTtcblxuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgb3B0aW9ucy5saW1pdCA9IDE7XG4gIHJldHVybiAoYXdhaXQgc2VsZi5maW5kKGNvbGxlY3Rpb25fbmFtZSwgc2VsZWN0b3IsIG9wdGlvbnMpLmZldGNoQXN5bmMoKSlbMF07XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmZpbmRPbmUgPSBmdW5jdGlvbiAoY29sbGVjdGlvbl9uYW1lLCBzZWxlY3RvcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICByZXR1cm4gRnV0dXJlLmZyb21Qcm9taXNlKHNlbGYuZmluZE9uZUFzeW5jKGNvbGxlY3Rpb25fbmFtZSwgc2VsZWN0b3IsIG9wdGlvbnMpKS53YWl0KCk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmNyZWF0ZUluZGV4QXN5bmMgPSBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIGluZGV4LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICAvLyBXZSBleHBlY3QgdGhpcyBmdW5jdGlvbiB0byBiZSBjYWxsZWQgYXQgc3RhcnR1cCwgbm90IGZyb20gd2l0aGluIGEgbWV0aG9kLFxuICAvLyBzbyB3ZSBkb24ndCBpbnRlcmFjdCB3aXRoIHRoZSB3cml0ZSBmZW5jZS5cbiAgdmFyIGNvbGxlY3Rpb24gPSBzZWxmLnJhd0NvbGxlY3Rpb24oY29sbGVjdGlvbk5hbWUpO1xuICByZXR1cm4gY29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleCwgb3B0aW9ucyk7XG59O1xuXG4vLyBXZSdsbCBhY3R1YWxseSBkZXNpZ24gYW4gaW5kZXggQVBJIGxhdGVyLiBGb3Igbm93LCB3ZSBqdXN0IHBhc3MgdGhyb3VnaCB0b1xuLy8gTW9uZ28ncywgYnV0IG1ha2UgaXQgc3luY2hyb25vdXMuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmNyZWF0ZUluZGV4ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCBpbmRleCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBcblxuICByZXR1cm4gRnV0dXJlLmZyb21Qcm9taXNlKHNlbGYuY3JlYXRlSW5kZXhBc3luYyhjb2xsZWN0aW9uTmFtZSwgaW5kZXgsIG9wdGlvbnMpKTtcbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuY291bnREb2N1bWVudHMgPSBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIC4uLmFyZ3MpIHtcbiAgYXJncyA9IGFyZ3MubWFwKGFyZyA9PiByZXBsYWNlVHlwZXMoYXJnLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbykpO1xuICBjb25zdCBjb2xsZWN0aW9uID0gdGhpcy5yYXdDb2xsZWN0aW9uKGNvbGxlY3Rpb25OYW1lKTtcbiAgcmV0dXJuIGNvbGxlY3Rpb24uY291bnREb2N1bWVudHMoLi4uYXJncyk7XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLmVzdGltYXRlZERvY3VtZW50Q291bnQgPSBmdW5jdGlvbiAoY29sbGVjdGlvbk5hbWUsIC4uLmFyZ3MpIHtcbiAgYXJncyA9IGFyZ3MubWFwKGFyZyA9PiByZXBsYWNlVHlwZXMoYXJnLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbykpO1xuICBjb25zdCBjb2xsZWN0aW9uID0gdGhpcy5yYXdDb2xsZWN0aW9uKGNvbGxlY3Rpb25OYW1lKTtcbiAgcmV0dXJuIGNvbGxlY3Rpb24uZXN0aW1hdGVkRG9jdW1lbnRDb3VudCguLi5hcmdzKTtcbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX2Vuc3VyZUluZGV4ID0gTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5jcmVhdGVJbmRleDtcblxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5fZHJvcEluZGV4ID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCBpbmRleCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgb25seSB1c2VkIGJ5IHRlc3QgY29kZSwgbm90IHdpdGhpbiBhIG1ldGhvZCwgc28gd2UgZG9uJ3RcbiAgLy8gaW50ZXJhY3Qgd2l0aCB0aGUgd3JpdGUgZmVuY2UuXG4gIHZhciBjb2xsZWN0aW9uID0gc2VsZi5yYXdDb2xsZWN0aW9uKGNvbGxlY3Rpb25OYW1lKTtcbiAgdmFyIGZ1dHVyZSA9IG5ldyBGdXR1cmU7XG4gIHZhciBpbmRleE5hbWUgPSBjb2xsZWN0aW9uLmRyb3BJbmRleChpbmRleCwgZnV0dXJlLnJlc29sdmVyKCkpO1xuICBmdXR1cmUud2FpdCgpO1xufTtcblxuLy8gQ1VSU09SU1xuXG4vLyBUaGVyZSBhcmUgc2V2ZXJhbCBjbGFzc2VzIHdoaWNoIHJlbGF0ZSB0byBjdXJzb3JzOlxuLy9cbi8vIEN1cnNvckRlc2NyaXB0aW9uIHJlcHJlc2VudHMgdGhlIGFyZ3VtZW50cyB1c2VkIHRvIGNvbnN0cnVjdCBhIGN1cnNvcjpcbi8vIGNvbGxlY3Rpb25OYW1lLCBzZWxlY3RvciwgYW5kIChmaW5kKSBvcHRpb25zLiAgQmVjYXVzZSBpdCBpcyB1c2VkIGFzIGEga2V5XG4vLyBmb3IgY3Vyc29yIGRlLWR1cCwgZXZlcnl0aGluZyBpbiBpdCBzaG91bGQgZWl0aGVyIGJlIEpTT04tc3RyaW5naWZpYWJsZSBvclxuLy8gbm90IGFmZmVjdCBvYnNlcnZlQ2hhbmdlcyBvdXRwdXQgKGVnLCBvcHRpb25zLnRyYW5zZm9ybSBmdW5jdGlvbnMgYXJlIG5vdFxuLy8gc3RyaW5naWZpYWJsZSBidXQgZG8gbm90IGFmZmVjdCBvYnNlcnZlQ2hhbmdlcykuXG4vL1xuLy8gU3luY2hyb25vdXNDdXJzb3IgaXMgYSB3cmFwcGVyIGFyb3VuZCBhIE1vbmdvREIgY3Vyc29yXG4vLyB3aGljaCBpbmNsdWRlcyBmdWxseS1zeW5jaHJvbm91cyB2ZXJzaW9ucyBvZiBmb3JFYWNoLCBldGMuXG4vL1xuLy8gQ3Vyc29yIGlzIHRoZSBjdXJzb3Igb2JqZWN0IHJldHVybmVkIGZyb20gZmluZCgpLCB3aGljaCBpbXBsZW1lbnRzIHRoZVxuLy8gZG9jdW1lbnRlZCBNb25nby5Db2xsZWN0aW9uIGN1cnNvciBBUEkuICBJdCB3cmFwcyBhIEN1cnNvckRlc2NyaXB0aW9uIGFuZCBhXG4vLyBTeW5jaHJvbm91c0N1cnNvciAobGF6aWx5OiBpdCBkb2Vzbid0IGNvbnRhY3QgTW9uZ28gdW50aWwgeW91IGNhbGwgYSBtZXRob2Rcbi8vIGxpa2UgZmV0Y2ggb3IgZm9yRWFjaCBvbiBpdCkuXG4vL1xuLy8gT2JzZXJ2ZUhhbmRsZSBpcyB0aGUgXCJvYnNlcnZlIGhhbmRsZVwiIHJldHVybmVkIGZyb20gb2JzZXJ2ZUNoYW5nZXMuIEl0IGhhcyBhXG4vLyByZWZlcmVuY2UgdG8gYW4gT2JzZXJ2ZU11bHRpcGxleGVyLlxuLy9cbi8vIE9ic2VydmVNdWx0aXBsZXhlciBhbGxvd3MgbXVsdGlwbGUgaWRlbnRpY2FsIE9ic2VydmVIYW5kbGVzIHRvIGJlIGRyaXZlbiBieSBhXG4vLyBzaW5nbGUgb2JzZXJ2ZSBkcml2ZXIuXG4vL1xuLy8gVGhlcmUgYXJlIHR3byBcIm9ic2VydmUgZHJpdmVyc1wiIHdoaWNoIGRyaXZlIE9ic2VydmVNdWx0aXBsZXhlcnM6XG4vLyAgIC0gUG9sbGluZ09ic2VydmVEcml2ZXIgY2FjaGVzIHRoZSByZXN1bHRzIG9mIGEgcXVlcnkgYW5kIHJlcnVucyBpdCB3aGVuXG4vLyAgICAgbmVjZXNzYXJ5LlxuLy8gICAtIE9wbG9nT2JzZXJ2ZURyaXZlciBmb2xsb3dzIHRoZSBNb25nbyBvcGVyYXRpb24gbG9nIHRvIGRpcmVjdGx5IG9ic2VydmVcbi8vICAgICBkYXRhYmFzZSBjaGFuZ2VzLlxuLy8gQm90aCBpbXBsZW1lbnRhdGlvbnMgZm9sbG93IHRoZSBzYW1lIHNpbXBsZSBpbnRlcmZhY2U6IHdoZW4geW91IGNyZWF0ZSB0aGVtLFxuLy8gdGhleSBzdGFydCBzZW5kaW5nIG9ic2VydmVDaGFuZ2VzIGNhbGxiYWNrcyAoYW5kIGEgcmVhZHkoKSBpbnZvY2F0aW9uKSB0b1xuLy8gdGhlaXIgT2JzZXJ2ZU11bHRpcGxleGVyLCBhbmQgeW91IHN0b3AgdGhlbSBieSBjYWxsaW5nIHRoZWlyIHN0b3AoKSBtZXRob2QuXG5cbkN1cnNvckRlc2NyaXB0aW9uID0gZnVuY3Rpb24gKGNvbGxlY3Rpb25OYW1lLCBzZWxlY3Rvciwgb3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHNlbGYuY29sbGVjdGlvbk5hbWUgPSBjb2xsZWN0aW9uTmFtZTtcbiAgc2VsZi5zZWxlY3RvciA9IE1vbmdvLkNvbGxlY3Rpb24uX3Jld3JpdGVTZWxlY3RvcihzZWxlY3Rvcik7XG4gIHNlbGYub3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG59O1xuXG5DdXJzb3IgPSBmdW5jdGlvbiAobW9uZ28sIGN1cnNvckRlc2NyaXB0aW9uKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBzZWxmLl9tb25nbyA9IG1vbmdvO1xuICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbiA9IGN1cnNvckRlc2NyaXB0aW9uO1xuICBzZWxmLl9zeW5jaHJvbm91c0N1cnNvciA9IG51bGw7XG59O1xuXG5mdW5jdGlvbiBzZXR1cFN5bmNocm9ub3VzQ3Vyc29yKGN1cnNvciwgbWV0aG9kKSB7XG4gIC8vIFlvdSBjYW4gb25seSBvYnNlcnZlIGEgdGFpbGFibGUgY3Vyc29yLlxuICBpZiAoY3Vyc29yLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnRhaWxhYmxlKVxuICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGNhbGwgJyArIG1ldGhvZCArICcgb24gYSB0YWlsYWJsZSBjdXJzb3InKTtcblxuICBpZiAoIWN1cnNvci5fc3luY2hyb25vdXNDdXJzb3IpIHtcbiAgICBjdXJzb3IuX3N5bmNocm9ub3VzQ3Vyc29yID0gY3Vyc29yLl9tb25nby5fY3JlYXRlU3luY2hyb25vdXNDdXJzb3IoXG4gICAgICBjdXJzb3IuX2N1cnNvckRlc2NyaXB0aW9uLFxuICAgICAge1xuICAgICAgICAvLyBNYWtlIHN1cmUgdGhhdCB0aGUgXCJjdXJzb3JcIiBhcmd1bWVudCB0byBmb3JFYWNoL21hcCBjYWxsYmFja3MgaXMgdGhlXG4gICAgICAgIC8vIEN1cnNvciwgbm90IHRoZSBTeW5jaHJvbm91c0N1cnNvci5cbiAgICAgICAgc2VsZkZvckl0ZXJhdGlvbjogY3Vyc29yLFxuICAgICAgICB1c2VUcmFuc2Zvcm06IHRydWUsXG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBjdXJzb3IuX3N5bmNocm9ub3VzQ3Vyc29yO1xufVxuXG5cbkN1cnNvci5wcm90b3R5cGUuY291bnQgPSBmdW5jdGlvbiAoKSB7XG5cbiAgY29uc3QgY29sbGVjdGlvbiA9IHRoaXMuX21vbmdvLnJhd0NvbGxlY3Rpb24odGhpcy5fY3Vyc29yRGVzY3JpcHRpb24uY29sbGVjdGlvbk5hbWUpO1xuICByZXR1cm4gUHJvbWlzZS5hd2FpdChjb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKFxuICAgIHJlcGxhY2VUeXBlcyh0aGlzLl9jdXJzb3JEZXNjcmlwdGlvbi5zZWxlY3RvciwgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pLFxuICAgIHJlcGxhY2VUeXBlcyh0aGlzLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyksXG4gICkpO1xufTtcblxuWy4uLkFTWU5DX0NVUlNPUl9NRVRIT0RTLCBTeW1ib2wuaXRlcmF0b3IsIFN5bWJvbC5hc3luY0l0ZXJhdG9yXS5mb3JFYWNoKG1ldGhvZE5hbWUgPT4ge1xuICAvLyBjb3VudCBpcyBoYW5kbGVkIHNwZWNpYWxseSBzaW5jZSB3ZSBkb24ndCB3YW50IHRvIGNyZWF0ZSBhIGN1cnNvci5cbiAgLy8gaXQgaXMgc3RpbGwgaW5jbHVkZWQgaW4gQVNZTkNfQ1VSU09SX01FVEhPRFMgYmVjYXVzZSB3ZSBzdGlsbCB3YW50IGFuIGFzeW5jIHZlcnNpb24gb2YgaXQgdG8gZXhpc3QuXG4gIGlmIChtZXRob2ROYW1lICE9PSAnY291bnQnKSB7XG4gICAgQ3Vyc29yLnByb3RvdHlwZVttZXRob2ROYW1lXSA9IGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gICAgICBjb25zdCBjdXJzb3IgPSBzZXR1cFN5bmNocm9ub3VzQ3Vyc29yKHRoaXMsIG1ldGhvZE5hbWUpO1xuICAgICAgcmV0dXJuIGN1cnNvclttZXRob2ROYW1lXSguLi5hcmdzKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gVGhlc2UgbWV0aG9kcyBhcmUgaGFuZGxlZCBzZXBhcmF0ZWx5LlxuICBpZiAobWV0aG9kTmFtZSA9PT0gU3ltYm9sLml0ZXJhdG9yIHx8IG1ldGhvZE5hbWUgPT09IFN5bWJvbC5hc3luY0l0ZXJhdG9yKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbWV0aG9kTmFtZUFzeW5jID0gZ2V0QXN5bmNNZXRob2ROYW1lKG1ldGhvZE5hbWUpO1xuICBDdXJzb3IucHJvdG90eXBlW21ldGhvZE5hbWVBc3luY10gPSBmdW5jdGlvbiAoLi4uYXJncykge1xuICAgIHRyeSB7XG4gICAgICB0aGlzW21ldGhvZE5hbWVdLmlzQ2FsbGVkRnJvbUFzeW5jID0gdHJ1ZTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpc1ttZXRob2ROYW1lXSguLi5hcmdzKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnJvcik7XG4gICAgfVxuICB9O1xufSk7XG5cbkN1cnNvci5wcm90b3R5cGUuZ2V0VHJhbnNmb3JtID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy50cmFuc2Zvcm07XG59O1xuXG4vLyBXaGVuIHlvdSBjYWxsIE1ldGVvci5wdWJsaXNoKCkgd2l0aCBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhIEN1cnNvciwgd2UgbmVlZFxuLy8gdG8gdHJhbnNtdXRlIGl0IGludG8gdGhlIGVxdWl2YWxlbnQgc3Vic2NyaXB0aW9uLiAgVGhpcyBpcyB0aGUgZnVuY3Rpb24gdGhhdFxuLy8gZG9lcyB0aGF0LlxuXG5DdXJzb3IucHJvdG90eXBlLl9wdWJsaXNoQ3Vyc29yID0gZnVuY3Rpb24gKHN1Yikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciBjb2xsZWN0aW9uID0gc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24uY29sbGVjdGlvbk5hbWU7XG4gIHJldHVybiBNb25nby5Db2xsZWN0aW9uLl9wdWJsaXNoQ3Vyc29yKHNlbGYsIHN1YiwgY29sbGVjdGlvbik7XG59O1xuXG4vLyBVc2VkIHRvIGd1YXJhbnRlZSB0aGF0IHB1Ymxpc2ggZnVuY3Rpb25zIHJldHVybiBhdCBtb3N0IG9uZSBjdXJzb3IgcGVyXG4vLyBjb2xsZWN0aW9uLiBQcml2YXRlLCBiZWNhdXNlIHdlIG1pZ2h0IGxhdGVyIGhhdmUgY3Vyc29ycyB0aGF0IGluY2x1ZGVcbi8vIGRvY3VtZW50cyBmcm9tIG11bHRpcGxlIGNvbGxlY3Rpb25zIHNvbWVob3cuXG5DdXJzb3IucHJvdG90eXBlLl9nZXRDb2xsZWN0aW9uTmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICByZXR1cm4gc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24uY29sbGVjdGlvbk5hbWU7XG59O1xuXG5DdXJzb3IucHJvdG90eXBlLm9ic2VydmUgPSBmdW5jdGlvbiAoY2FsbGJhY2tzKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgcmV0dXJuIExvY2FsQ29sbGVjdGlvbi5fb2JzZXJ2ZUZyb21PYnNlcnZlQ2hhbmdlcyhzZWxmLCBjYWxsYmFja3MpO1xufTtcblxuQ3Vyc29yLnByb3RvdHlwZS5vYnNlcnZlQ2hhbmdlcyA9IGZ1bmN0aW9uIChjYWxsYmFja3MsIG9wdGlvbnMgPSB7fSkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciBtZXRob2RzID0gW1xuICAgICdhZGRlZEF0JyxcbiAgICAnYWRkZWQnLFxuICAgICdjaGFuZ2VkQXQnLFxuICAgICdjaGFuZ2VkJyxcbiAgICAncmVtb3ZlZEF0JyxcbiAgICAncmVtb3ZlZCcsXG4gICAgJ21vdmVkVG8nXG4gIF07XG4gIHZhciBvcmRlcmVkID0gTG9jYWxDb2xsZWN0aW9uLl9vYnNlcnZlQ2hhbmdlc0NhbGxiYWNrc0FyZU9yZGVyZWQoY2FsbGJhY2tzKTtcblxuICBsZXQgZXhjZXB0aW9uTmFtZSA9IGNhbGxiYWNrcy5fZnJvbU9ic2VydmUgPyAnb2JzZXJ2ZScgOiAnb2JzZXJ2ZUNoYW5nZXMnO1xuICBleGNlcHRpb25OYW1lICs9ICcgY2FsbGJhY2snO1xuICBtZXRob2RzLmZvckVhY2goZnVuY3Rpb24gKG1ldGhvZCkge1xuICAgIGlmIChjYWxsYmFja3NbbWV0aG9kXSAmJiB0eXBlb2YgY2FsbGJhY2tzW21ldGhvZF0gPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBjYWxsYmFja3NbbWV0aG9kXSA9IE1ldGVvci5iaW5kRW52aXJvbm1lbnQoY2FsbGJhY2tzW21ldGhvZF0sIG1ldGhvZCArIGV4Y2VwdGlvbk5hbWUpO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHNlbGYuX21vbmdvLl9vYnNlcnZlQ2hhbmdlcyhcbiAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbiwgb3JkZXJlZCwgY2FsbGJhY2tzLCBvcHRpb25zLm5vbk11dGF0aW5nQ2FsbGJhY2tzKTtcbn07XG5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUuX2NyZWF0ZVN5bmNocm9ub3VzQ3Vyc29yID0gZnVuY3Rpb24oXG4gICAgY3Vyc29yRGVzY3JpcHRpb24sIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBvcHRpb25zID0gXy5waWNrKG9wdGlvbnMgfHwge30sICdzZWxmRm9ySXRlcmF0aW9uJywgJ3VzZVRyYW5zZm9ybScpO1xuXG4gIHZhciBjb2xsZWN0aW9uID0gc2VsZi5yYXdDb2xsZWN0aW9uKGN1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lKTtcbiAgdmFyIGN1cnNvck9wdGlvbnMgPSBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zO1xuICB2YXIgbW9uZ29PcHRpb25zID0ge1xuICAgIHNvcnQ6IGN1cnNvck9wdGlvbnMuc29ydCxcbiAgICBsaW1pdDogY3Vyc29yT3B0aW9ucy5saW1pdCxcbiAgICBza2lwOiBjdXJzb3JPcHRpb25zLnNraXAsXG4gICAgcHJvamVjdGlvbjogY3Vyc29yT3B0aW9ucy5maWVsZHMgfHwgY3Vyc29yT3B0aW9ucy5wcm9qZWN0aW9uLFxuICAgIHJlYWRQcmVmZXJlbmNlOiBjdXJzb3JPcHRpb25zLnJlYWRQcmVmZXJlbmNlLFxuICB9O1xuXG4gIC8vIERvIHdlIHdhbnQgYSB0YWlsYWJsZSBjdXJzb3IgKHdoaWNoIG9ubHkgd29ya3Mgb24gY2FwcGVkIGNvbGxlY3Rpb25zKT9cbiAgaWYgKGN1cnNvck9wdGlvbnMudGFpbGFibGUpIHtcbiAgICBtb25nb09wdGlvbnMubnVtYmVyT2ZSZXRyaWVzID0gLTE7XG4gIH1cblxuICB2YXIgZGJDdXJzb3IgPSBjb2xsZWN0aW9uLmZpbmQoXG4gICAgcmVwbGFjZVR5cGVzKGN1cnNvckRlc2NyaXB0aW9uLnNlbGVjdG9yLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyksXG4gICAgbW9uZ29PcHRpb25zKTtcblxuICAvLyBEbyB3ZSB3YW50IGEgdGFpbGFibGUgY3Vyc29yICh3aGljaCBvbmx5IHdvcmtzIG9uIGNhcHBlZCBjb2xsZWN0aW9ucyk/XG4gIGlmIChjdXJzb3JPcHRpb25zLnRhaWxhYmxlKSB7XG4gICAgLy8gV2Ugd2FudCBhIHRhaWxhYmxlIGN1cnNvci4uLlxuICAgIGRiQ3Vyc29yLmFkZEN1cnNvckZsYWcoXCJ0YWlsYWJsZVwiLCB0cnVlKVxuICAgIC8vIC4uLiBhbmQgZm9yIHRoZSBzZXJ2ZXIgdG8gd2FpdCBhIGJpdCBpZiBhbnkgZ2V0TW9yZSBoYXMgbm8gZGF0YSAocmF0aGVyXG4gICAgLy8gdGhhbiBtYWtpbmcgdXMgcHV0IHRoZSByZWxldmFudCBzbGVlcHMgaW4gdGhlIGNsaWVudCkuLi5cbiAgICBkYkN1cnNvci5hZGRDdXJzb3JGbGFnKFwiYXdhaXREYXRhXCIsIHRydWUpXG5cbiAgICAvLyBBbmQgaWYgdGhpcyBpcyBvbiB0aGUgb3Bsb2cgY29sbGVjdGlvbiBhbmQgdGhlIGN1cnNvciBzcGVjaWZpZXMgYSAndHMnLFxuICAgIC8vIHRoZW4gc2V0IHRoZSB1bmRvY3VtZW50ZWQgb3Bsb2cgcmVwbGF5IGZsYWcsIHdoaWNoIGRvZXMgYSBzcGVjaWFsIHNjYW4gdG9cbiAgICAvLyBmaW5kIHRoZSBmaXJzdCBkb2N1bWVudCAoaW5zdGVhZCBvZiBjcmVhdGluZyBhbiBpbmRleCBvbiB0cykuIFRoaXMgaXMgYVxuICAgIC8vIHZlcnkgaGFyZC1jb2RlZCBNb25nbyBmbGFnIHdoaWNoIG9ubHkgd29ya3Mgb24gdGhlIG9wbG9nIGNvbGxlY3Rpb24gYW5kXG4gICAgLy8gb25seSB3b3JrcyB3aXRoIHRoZSB0cyBmaWVsZC5cbiAgICBpZiAoY3Vyc29yRGVzY3JpcHRpb24uY29sbGVjdGlvbk5hbWUgPT09IE9QTE9HX0NPTExFQ1RJT04gJiZcbiAgICAgICAgY3Vyc29yRGVzY3JpcHRpb24uc2VsZWN0b3IudHMpIHtcbiAgICAgIGRiQ3Vyc29yLmFkZEN1cnNvckZsYWcoXCJvcGxvZ1JlcGxheVwiLCB0cnVlKVxuICAgIH1cbiAgfVxuXG4gIGlmICh0eXBlb2YgY3Vyc29yT3B0aW9ucy5tYXhUaW1lTXMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZGJDdXJzb3IgPSBkYkN1cnNvci5tYXhUaW1lTVMoY3Vyc29yT3B0aW9ucy5tYXhUaW1lTXMpO1xuICB9XG4gIGlmICh0eXBlb2YgY3Vyc29yT3B0aW9ucy5oaW50ICE9PSAndW5kZWZpbmVkJykge1xuICAgIGRiQ3Vyc29yID0gZGJDdXJzb3IuaGludChjdXJzb3JPcHRpb25zLmhpbnQpO1xuICB9XG5cbiAgcmV0dXJuIG5ldyBTeW5jaHJvbm91c0N1cnNvcihkYkN1cnNvciwgY3Vyc29yRGVzY3JpcHRpb24sIG9wdGlvbnMsIGNvbGxlY3Rpb24pO1xufTtcblxudmFyIFN5bmNocm9ub3VzQ3Vyc29yID0gZnVuY3Rpb24gKGRiQ3Vyc29yLCBjdXJzb3JEZXNjcmlwdGlvbiwgb3B0aW9ucywgY29sbGVjdGlvbikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIG9wdGlvbnMgPSBfLnBpY2sob3B0aW9ucyB8fCB7fSwgJ3NlbGZGb3JJdGVyYXRpb24nLCAndXNlVHJhbnNmb3JtJyk7XG5cbiAgc2VsZi5fZGJDdXJzb3IgPSBkYkN1cnNvcjtcbiAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24gPSBjdXJzb3JEZXNjcmlwdGlvbjtcbiAgLy8gVGhlIFwic2VsZlwiIGFyZ3VtZW50IHBhc3NlZCB0byBmb3JFYWNoL21hcCBjYWxsYmFja3MuIElmIHdlJ3JlIHdyYXBwZWRcbiAgLy8gaW5zaWRlIGEgdXNlci12aXNpYmxlIEN1cnNvciwgd2Ugd2FudCB0byBwcm92aWRlIHRoZSBvdXRlciBjdXJzb3IhXG4gIHNlbGYuX3NlbGZGb3JJdGVyYXRpb24gPSBvcHRpb25zLnNlbGZGb3JJdGVyYXRpb24gfHwgc2VsZjtcbiAgaWYgKG9wdGlvbnMudXNlVHJhbnNmb3JtICYmIGN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMudHJhbnNmb3JtKSB7XG4gICAgc2VsZi5fdHJhbnNmb3JtID0gTG9jYWxDb2xsZWN0aW9uLndyYXBUcmFuc2Zvcm0oXG4gICAgICBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnRyYW5zZm9ybSk7XG4gIH0gZWxzZSB7XG4gICAgc2VsZi5fdHJhbnNmb3JtID0gbnVsbDtcbiAgfVxuXG4gIHNlbGYuX3N5bmNocm9ub3VzQ291bnQgPSBGdXR1cmUud3JhcChcbiAgICBjb2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzLmJpbmQoXG4gICAgICBjb2xsZWN0aW9uLFxuICAgICAgcmVwbGFjZVR5cGVzKGN1cnNvckRlc2NyaXB0aW9uLnNlbGVjdG9yLCByZXBsYWNlTWV0ZW9yQXRvbVdpdGhNb25nbyksXG4gICAgICByZXBsYWNlVHlwZXMoY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucywgcmVwbGFjZU1ldGVvckF0b21XaXRoTW9uZ28pLFxuICAgIClcbiAgKTtcbiAgc2VsZi5fdmlzaXRlZElkcyA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xufTtcblxuXy5leHRlbmQoU3luY2hyb25vdXNDdXJzb3IucHJvdG90eXBlLCB7XG4gIC8vIFJldHVybnMgYSBQcm9taXNlIGZvciB0aGUgbmV4dCBvYmplY3QgZnJvbSB0aGUgdW5kZXJseWluZyBjdXJzb3IgKGJlZm9yZVxuICAvLyB0aGUgTW9uZ28tPk1ldGVvciB0eXBlIHJlcGxhY2VtZW50KS5cbiAgX3Jhd05leHRPYmplY3RQcm9taXNlOiBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHNlbGYuX2RiQ3Vyc29yLm5leHQoKGVyciwgZG9jKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKGRvYyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9LFxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlIGZvciB0aGUgbmV4dCBvYmplY3QgZnJvbSB0aGUgY3Vyc29yLCBza2lwcGluZyB0aG9zZSB3aG9zZVxuICAvLyBJRHMgd2UndmUgYWxyZWFkeSBzZWVuIGFuZCByZXBsYWNpbmcgTW9uZ28gYXRvbXMgd2l0aCBNZXRlb3IgYXRvbXMuXG4gIF9uZXh0T2JqZWN0UHJvbWlzZTogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICB2YXIgZG9jID0gYXdhaXQgc2VsZi5fcmF3TmV4dE9iamVjdFByb21pc2UoKTtcblxuICAgICAgaWYgKCFkb2MpIHJldHVybiBudWxsO1xuICAgICAgZG9jID0gcmVwbGFjZVR5cGVzKGRvYywgcmVwbGFjZU1vbmdvQXRvbVdpdGhNZXRlb3IpO1xuXG4gICAgICBpZiAoIXNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMudGFpbGFibGUgJiYgXy5oYXMoZG9jLCAnX2lkJykpIHtcbiAgICAgICAgLy8gRGlkIE1vbmdvIGdpdmUgdXMgZHVwbGljYXRlIGRvY3VtZW50cyBpbiB0aGUgc2FtZSBjdXJzb3I/IElmIHNvLFxuICAgICAgICAvLyBpZ25vcmUgdGhpcyBvbmUuIChEbyB0aGlzIGJlZm9yZSB0aGUgdHJhbnNmb3JtLCBzaW5jZSB0cmFuc2Zvcm0gbWlnaHRcbiAgICAgICAgLy8gcmV0dXJuIHNvbWUgdW5yZWxhdGVkIHZhbHVlLikgV2UgZG9uJ3QgZG8gdGhpcyBmb3IgdGFpbGFibGUgY3Vyc29ycyxcbiAgICAgICAgLy8gYmVjYXVzZSB3ZSB3YW50IHRvIG1haW50YWluIE8oMSkgbWVtb3J5IHVzYWdlLiBBbmQgaWYgdGhlcmUgaXNuJ3QgX2lkXG4gICAgICAgIC8vIGZvciBzb21lIHJlYXNvbiAobWF5YmUgaXQncyB0aGUgb3Bsb2cpLCB0aGVuIHdlIGRvbid0IGRvIHRoaXMgZWl0aGVyLlxuICAgICAgICAvLyAoQmUgY2FyZWZ1bCB0byBkbyB0aGlzIGZvciBmYWxzZXkgYnV0IGV4aXN0aW5nIF9pZCwgdGhvdWdoLilcbiAgICAgICAgaWYgKHNlbGYuX3Zpc2l0ZWRJZHMuaGFzKGRvYy5faWQpKSBjb250aW51ZTtcbiAgICAgICAgc2VsZi5fdmlzaXRlZElkcy5zZXQoZG9jLl9pZCwgdHJ1ZSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChzZWxmLl90cmFuc2Zvcm0pXG4gICAgICAgIGRvYyA9IHNlbGYuX3RyYW5zZm9ybShkb2MpO1xuXG4gICAgICByZXR1cm4gZG9jO1xuICAgIH1cbiAgfSxcblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB3aGljaCBpcyByZXNvbHZlZCB3aXRoIHRoZSBuZXh0IG9iamVjdCAobGlrZSB3aXRoXG4gIC8vIF9uZXh0T2JqZWN0UHJvbWlzZSkgb3IgcmVqZWN0ZWQgaWYgdGhlIGN1cnNvciBkb2Vzbid0IHJldHVybiB3aXRoaW5cbiAgLy8gdGltZW91dE1TIG1zLlxuICBfbmV4dE9iamVjdFByb21pc2VXaXRoVGltZW91dDogZnVuY3Rpb24gKHRpbWVvdXRNUykge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmICghdGltZW91dE1TKSB7XG4gICAgICByZXR1cm4gc2VsZi5fbmV4dE9iamVjdFByb21pc2UoKTtcbiAgICB9XG4gICAgY29uc3QgbmV4dE9iamVjdFByb21pc2UgPSBzZWxmLl9uZXh0T2JqZWN0UHJvbWlzZSgpO1xuICAgIGNvbnN0IHRpbWVvdXRFcnIgPSBuZXcgRXJyb3IoJ0NsaWVudC1zaWRlIHRpbWVvdXQgd2FpdGluZyBmb3IgbmV4dCBvYmplY3QnKTtcbiAgICBjb25zdCB0aW1lb3V0UHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHJlamVjdCh0aW1lb3V0RXJyKTtcbiAgICAgIH0sIHRpbWVvdXRNUyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmFjZShbbmV4dE9iamVjdFByb21pc2UsIHRpbWVvdXRQcm9taXNlXSlcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIGlmIChlcnIgPT09IHRpbWVvdXRFcnIpIHtcbiAgICAgICAgICBzZWxmLmNsb3NlKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gIH0sXG5cbiAgX25leHRPYmplY3Q6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHNlbGYuX25leHRPYmplY3RQcm9taXNlKCkuYXdhaXQoKTtcbiAgfSxcblxuICBmb3JFYWNoOiBmdW5jdGlvbiAoY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgY29uc3Qgd3JhcHBlZEZuID0gTWV0ZW9yLndyYXBGbihjYWxsYmFjayk7XG5cbiAgICAvLyBHZXQgYmFjayB0byB0aGUgYmVnaW5uaW5nLlxuICAgIHNlbGYuX3Jld2luZCgpO1xuXG4gICAgLy8gV2UgaW1wbGVtZW50IHRoZSBsb29wIG91cnNlbGYgaW5zdGVhZCBvZiB1c2luZyBzZWxmLl9kYkN1cnNvci5lYWNoLFxuICAgIC8vIGJlY2F1c2UgXCJlYWNoXCIgd2lsbCBjYWxsIGl0cyBjYWxsYmFjayBvdXRzaWRlIG9mIGEgZmliZXIgd2hpY2ggbWFrZXMgaXRcbiAgICAvLyBtdWNoIG1vcmUgY29tcGxleCB0byBtYWtlIHRoaXMgZnVuY3Rpb24gc3luY2hyb25vdXMuXG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgdmFyIGRvYyA9IHNlbGYuX25leHRPYmplY3QoKTtcbiAgICAgIGlmICghZG9jKSByZXR1cm47XG4gICAgICB3cmFwcGVkRm4uY2FsbCh0aGlzQXJnLCBkb2MsIGluZGV4KyssIHNlbGYuX3NlbGZGb3JJdGVyYXRpb24pO1xuICAgIH1cbiAgfSxcblxuICAvLyBYWFggQWxsb3cgb3ZlcmxhcHBpbmcgY2FsbGJhY2sgZXhlY3V0aW9ucyBpZiBjYWxsYmFjayB5aWVsZHMuXG4gIG1hcDogZnVuY3Rpb24gKGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGNvbnN0IHdyYXBwZWRGbiA9IE1ldGVvci53cmFwRm4oY2FsbGJhY2spO1xuICAgIHZhciByZXMgPSBbXTtcbiAgICBzZWxmLmZvckVhY2goZnVuY3Rpb24gKGRvYywgaW5kZXgpIHtcbiAgICAgIHJlcy5wdXNoKHdyYXBwZWRGbi5jYWxsKHRoaXNBcmcsIGRvYywgaW5kZXgsIHNlbGYuX3NlbGZGb3JJdGVyYXRpb24pKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzO1xuICB9LFxuXG4gIF9yZXdpbmQ6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAvLyBrbm93biB0byBiZSBzeW5jaHJvbm91c1xuICAgIHNlbGYuX2RiQ3Vyc29yLnJld2luZCgpO1xuXG4gICAgc2VsZi5fdmlzaXRlZElkcyA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuICB9LFxuXG4gIC8vIE1vc3RseSB1c2FibGUgZm9yIHRhaWxhYmxlIGN1cnNvcnMuXG4gIGNsb3NlOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgc2VsZi5fZGJDdXJzb3IuY2xvc2UoKTtcbiAgfSxcblxuICBmZXRjaDogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gc2VsZi5tYXAoXy5pZGVudGl0eSk7XG4gIH0sXG5cbiAgY291bnQ6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHNlbGYuX3N5bmNocm9ub3VzQ291bnQoKS53YWl0KCk7XG4gIH0sXG5cbiAgLy8gVGhpcyBtZXRob2QgaXMgTk9UIHdyYXBwZWQgaW4gQ3Vyc29yLlxuICBnZXRSYXdPYmplY3RzOiBmdW5jdGlvbiAob3JkZXJlZCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAob3JkZXJlZCkge1xuICAgICAgcmV0dXJuIHNlbGYuZmV0Y2goKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlc3VsdHMgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgICAgIHNlbGYuZm9yRWFjaChmdW5jdGlvbiAoZG9jKSB7XG4gICAgICAgIHJlc3VsdHMuc2V0KGRvYy5faWQsIGRvYyk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cbiAgfVxufSk7XG5cblN5bmNocm9ub3VzQ3Vyc29yLnByb3RvdHlwZVtTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgLy8gR2V0IGJhY2sgdG8gdGhlIGJlZ2lubmluZy5cbiAgc2VsZi5fcmV3aW5kKCk7XG5cbiAgcmV0dXJuIHtcbiAgICBuZXh0KCkge1xuICAgICAgY29uc3QgZG9jID0gc2VsZi5fbmV4dE9iamVjdCgpO1xuICAgICAgcmV0dXJuIGRvYyA/IHtcbiAgICAgICAgdmFsdWU6IGRvY1xuICAgICAgfSA6IHtcbiAgICAgICAgZG9uZTogdHJ1ZVxuICAgICAgfTtcbiAgICB9XG4gIH07XG59O1xuXG5TeW5jaHJvbm91c0N1cnNvci5wcm90b3R5cGVbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBzeW5jUmVzdWx0ID0gdGhpc1tTeW1ib2wuaXRlcmF0b3JdKCk7XG4gIHJldHVybiB7XG4gICAgYXN5bmMgbmV4dCgpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3luY1Jlc3VsdC5uZXh0KCkpO1xuICAgIH1cbiAgfTtcbn1cblxuLy8gVGFpbHMgdGhlIGN1cnNvciBkZXNjcmliZWQgYnkgY3Vyc29yRGVzY3JpcHRpb24sIG1vc3QgbGlrZWx5IG9uIHRoZVxuLy8gb3Bsb2cuIENhbGxzIGRvY0NhbGxiYWNrIHdpdGggZWFjaCBkb2N1bWVudCBmb3VuZC4gSWdub3JlcyBlcnJvcnMgYW5kIGp1c3Rcbi8vIHJlc3RhcnRzIHRoZSB0YWlsIG9uIGVycm9yLlxuLy9cbi8vIElmIHRpbWVvdXRNUyBpcyBzZXQsIHRoZW4gaWYgd2UgZG9uJ3QgZ2V0IGEgbmV3IGRvY3VtZW50IGV2ZXJ5IHRpbWVvdXRNUyxcbi8vIGtpbGwgYW5kIHJlc3RhcnQgdGhlIGN1cnNvci4gVGhpcyBpcyBwcmltYXJpbHkgYSB3b3JrYXJvdW5kIGZvciAjODU5OC5cbk1vbmdvQ29ubmVjdGlvbi5wcm90b3R5cGUudGFpbCA9IGZ1bmN0aW9uIChjdXJzb3JEZXNjcmlwdGlvbiwgZG9jQ2FsbGJhY2ssIHRpbWVvdXRNUykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGlmICghY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy50YWlsYWJsZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4gb25seSB0YWlsIGEgdGFpbGFibGUgY3Vyc29yXCIpO1xuXG4gIHZhciBjdXJzb3IgPSBzZWxmLl9jcmVhdGVTeW5jaHJvbm91c0N1cnNvcihjdXJzb3JEZXNjcmlwdGlvbik7XG5cbiAgdmFyIHN0b3BwZWQgPSBmYWxzZTtcbiAgdmFyIGxhc3RUUztcbiAgdmFyIGxvb3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGRvYyA9IG51bGw7XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGlmIChzdG9wcGVkKVxuICAgICAgICByZXR1cm47XG4gICAgICB0cnkge1xuICAgICAgICBkb2MgPSBjdXJzb3IuX25leHRPYmplY3RQcm9taXNlV2l0aFRpbWVvdXQodGltZW91dE1TKS5hd2FpdCgpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIC8vIFRoZXJlJ3Mgbm8gZ29vZCB3YXkgdG8gZmlndXJlIG91dCBpZiB0aGlzIHdhcyBhY3R1YWxseSBhbiBlcnJvciBmcm9tXG4gICAgICAgIC8vIE1vbmdvLCBvciBqdXN0IGNsaWVudC1zaWRlIChpbmNsdWRpbmcgb3VyIG93biB0aW1lb3V0IGVycm9yKS4gQWhcbiAgICAgICAgLy8gd2VsbC4gQnV0IGVpdGhlciB3YXksIHdlIG5lZWQgdG8gcmV0cnkgdGhlIGN1cnNvciAodW5sZXNzIHRoZSBmYWlsdXJlXG4gICAgICAgIC8vIHdhcyBiZWNhdXNlIHRoZSBvYnNlcnZlIGdvdCBzdG9wcGVkKS5cbiAgICAgICAgZG9jID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIC8vIFNpbmNlIHdlIGF3YWl0ZWQgYSBwcm9taXNlIGFib3ZlLCB3ZSBuZWVkIHRvIGNoZWNrIGFnYWluIHRvIHNlZSBpZlxuICAgICAgLy8gd2UndmUgYmVlbiBzdG9wcGVkIGJlZm9yZSBjYWxsaW5nIHRoZSBjYWxsYmFjay5cbiAgICAgIGlmIChzdG9wcGVkKVxuICAgICAgICByZXR1cm47XG4gICAgICBpZiAoZG9jKSB7XG4gICAgICAgIC8vIElmIGEgdGFpbGFibGUgY3Vyc29yIGNvbnRhaW5zIGEgXCJ0c1wiIGZpZWxkLCB1c2UgaXQgdG8gcmVjcmVhdGUgdGhlXG4gICAgICAgIC8vIGN1cnNvciBvbiBlcnJvci4gKFwidHNcIiBpcyBhIHN0YW5kYXJkIHRoYXQgTW9uZ28gdXNlcyBpbnRlcm5hbGx5IGZvclxuICAgICAgICAvLyB0aGUgb3Bsb2csIGFuZCB0aGVyZSdzIGEgc3BlY2lhbCBmbGFnIHRoYXQgbGV0cyB5b3UgZG8gYmluYXJ5IHNlYXJjaFxuICAgICAgICAvLyBvbiBpdCBpbnN0ZWFkIG9mIG5lZWRpbmcgdG8gdXNlIGFuIGluZGV4LilcbiAgICAgICAgbGFzdFRTID0gZG9jLnRzO1xuICAgICAgICBkb2NDYWxsYmFjayhkb2MpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIG5ld1NlbGVjdG9yID0gXy5jbG9uZShjdXJzb3JEZXNjcmlwdGlvbi5zZWxlY3Rvcik7XG4gICAgICAgIGlmIChsYXN0VFMpIHtcbiAgICAgICAgICBuZXdTZWxlY3Rvci50cyA9IHskZ3Q6IGxhc3RUU307XG4gICAgICAgIH1cbiAgICAgICAgY3Vyc29yID0gc2VsZi5fY3JlYXRlU3luY2hyb25vdXNDdXJzb3IobmV3IEN1cnNvckRlc2NyaXB0aW9uKFxuICAgICAgICAgIGN1cnNvckRlc2NyaXB0aW9uLmNvbGxlY3Rpb25OYW1lLFxuICAgICAgICAgIG5ld1NlbGVjdG9yLFxuICAgICAgICAgIGN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMpKTtcbiAgICAgICAgLy8gTW9uZ28gZmFpbG92ZXIgdGFrZXMgbWFueSBzZWNvbmRzLiAgUmV0cnkgaW4gYSBiaXQuICAoV2l0aG91dCB0aGlzXG4gICAgICAgIC8vIHNldFRpbWVvdXQsIHdlIHBlZyB0aGUgQ1BVIGF0IDEwMCUgYW5kIG5ldmVyIG5vdGljZSB0aGUgYWN0dWFsXG4gICAgICAgIC8vIGZhaWxvdmVyLlxuICAgICAgICBNZXRlb3Iuc2V0VGltZW91dChsb29wLCAxMDApO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgTWV0ZW9yLmRlZmVyKGxvb3ApO1xuXG4gIHJldHVybiB7XG4gICAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgc3RvcHBlZCA9IHRydWU7XG4gICAgICBjdXJzb3IuY2xvc2UoKTtcbiAgICB9XG4gIH07XG59O1xuXG5Nb25nb0Nvbm5lY3Rpb24ucHJvdG90eXBlLl9vYnNlcnZlQ2hhbmdlcyA9IGZ1bmN0aW9uIChcbiAgICBjdXJzb3JEZXNjcmlwdGlvbiwgb3JkZXJlZCwgY2FsbGJhY2tzLCBub25NdXRhdGluZ0NhbGxiYWNrcykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKGN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMudGFpbGFibGUpIHtcbiAgICByZXR1cm4gc2VsZi5fb2JzZXJ2ZUNoYW5nZXNUYWlsYWJsZShjdXJzb3JEZXNjcmlwdGlvbiwgb3JkZXJlZCwgY2FsbGJhY2tzKTtcbiAgfVxuXG4gIC8vIFlvdSBtYXkgbm90IGZpbHRlciBvdXQgX2lkIHdoZW4gb2JzZXJ2aW5nIGNoYW5nZXMsIGJlY2F1c2UgdGhlIGlkIGlzIGEgY29yZVxuICAvLyBwYXJ0IG9mIHRoZSBvYnNlcnZlQ2hhbmdlcyBBUEkuXG4gIGNvbnN0IGZpZWxkc09wdGlvbnMgPSBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnByb2plY3Rpb24gfHwgY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5maWVsZHM7XG4gIGlmIChmaWVsZHNPcHRpb25zICYmXG4gICAgICAoZmllbGRzT3B0aW9ucy5faWQgPT09IDAgfHxcbiAgICAgICBmaWVsZHNPcHRpb25zLl9pZCA9PT0gZmFsc2UpKSB7XG4gICAgdGhyb3cgRXJyb3IoXCJZb3UgbWF5IG5vdCBvYnNlcnZlIGEgY3Vyc29yIHdpdGgge2ZpZWxkczoge19pZDogMH19XCIpO1xuICB9XG5cbiAgdmFyIG9ic2VydmVLZXkgPSBFSlNPTi5zdHJpbmdpZnkoXG4gICAgXy5leHRlbmQoe29yZGVyZWQ6IG9yZGVyZWR9LCBjdXJzb3JEZXNjcmlwdGlvbikpO1xuXG4gIHZhciBtdWx0aXBsZXhlciwgb2JzZXJ2ZURyaXZlcjtcbiAgdmFyIGZpcnN0SGFuZGxlID0gZmFsc2U7XG5cbiAgLy8gRmluZCBhIG1hdGNoaW5nIE9ic2VydmVNdWx0aXBsZXhlciwgb3IgY3JlYXRlIGEgbmV3IG9uZS4gVGhpcyBuZXh0IGJsb2NrIGlzXG4gIC8vIGd1YXJhbnRlZWQgdG8gbm90IHlpZWxkIChhbmQgaXQgZG9lc24ndCBjYWxsIGFueXRoaW5nIHRoYXQgY2FuIG9ic2VydmUgYVxuICAvLyBuZXcgcXVlcnkpLCBzbyBubyBvdGhlciBjYWxscyB0byB0aGlzIGZ1bmN0aW9uIGNhbiBpbnRlcmxlYXZlIHdpdGggaXQuXG4gIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoXy5oYXMoc2VsZi5fb2JzZXJ2ZU11bHRpcGxleGVycywgb2JzZXJ2ZUtleSkpIHtcbiAgICAgIG11bHRpcGxleGVyID0gc2VsZi5fb2JzZXJ2ZU11bHRpcGxleGVyc1tvYnNlcnZlS2V5XTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmlyc3RIYW5kbGUgPSB0cnVlO1xuICAgICAgLy8gQ3JlYXRlIGEgbmV3IE9ic2VydmVNdWx0aXBsZXhlci5cbiAgICAgIG11bHRpcGxleGVyID0gbmV3IE9ic2VydmVNdWx0aXBsZXhlcih7XG4gICAgICAgIG9yZGVyZWQ6IG9yZGVyZWQsXG4gICAgICAgIG9uU3RvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGRlbGV0ZSBzZWxmLl9vYnNlcnZlTXVsdGlwbGV4ZXJzW29ic2VydmVLZXldO1xuICAgICAgICAgIG9ic2VydmVEcml2ZXIuc3RvcCgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHNlbGYuX29ic2VydmVNdWx0aXBsZXhlcnNbb2JzZXJ2ZUtleV0gPSBtdWx0aXBsZXhlcjtcbiAgICB9XG4gIH0pO1xuXG4gIHZhciBvYnNlcnZlSGFuZGxlID0gbmV3IE9ic2VydmVIYW5kbGUobXVsdGlwbGV4ZXIsXG4gICAgY2FsbGJhY2tzLFxuICAgIG5vbk11dGF0aW5nQ2FsbGJhY2tzLFxuICApO1xuXG4gIGlmIChmaXJzdEhhbmRsZSkge1xuICAgIHZhciBtYXRjaGVyLCBzb3J0ZXI7XG4gICAgdmFyIGNhblVzZU9wbG9nID0gXy5hbGwoW1xuICAgICAgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBBdCBhIGJhcmUgbWluaW11bSwgdXNpbmcgdGhlIG9wbG9nIHJlcXVpcmVzIHVzIHRvIGhhdmUgYW4gb3Bsb2csIHRvXG4gICAgICAgIC8vIHdhbnQgdW5vcmRlcmVkIGNhbGxiYWNrcywgYW5kIHRvIG5vdCB3YW50IGEgY2FsbGJhY2sgb24gdGhlIHBvbGxzXG4gICAgICAgIC8vIHRoYXQgd29uJ3QgaGFwcGVuLlxuICAgICAgICByZXR1cm4gc2VsZi5fb3Bsb2dIYW5kbGUgJiYgIW9yZGVyZWQgJiZcbiAgICAgICAgICAhY2FsbGJhY2tzLl90ZXN0T25seVBvbGxDYWxsYmFjaztcbiAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gV2UgbmVlZCB0byBiZSBhYmxlIHRvIGNvbXBpbGUgdGhlIHNlbGVjdG9yLiBGYWxsIGJhY2sgdG8gcG9sbGluZyBmb3JcbiAgICAgICAgLy8gc29tZSBuZXdmYW5nbGVkICRzZWxlY3RvciB0aGF0IG1pbmltb25nbyBkb2Vzbid0IHN1cHBvcnQgeWV0LlxuICAgICAgICB0cnkge1xuICAgICAgICAgIG1hdGNoZXIgPSBuZXcgTWluaW1vbmdvLk1hdGNoZXIoY3Vyc29yRGVzY3JpcHRpb24uc2VsZWN0b3IpO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gWFhYIG1ha2UgYWxsIGNvbXBpbGF0aW9uIGVycm9ycyBNaW5pbW9uZ29FcnJvciBvciBzb21ldGhpbmdcbiAgICAgICAgICAvLyAgICAgc28gdGhhdCB0aGlzIGRvZXNuJ3QgaWdub3JlIHVucmVsYXRlZCBleGNlcHRpb25zXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIC4uLiBhbmQgdGhlIHNlbGVjdG9yIGl0c2VsZiBuZWVkcyB0byBzdXBwb3J0IG9wbG9nLlxuICAgICAgICByZXR1cm4gT3Bsb2dPYnNlcnZlRHJpdmVyLmN1cnNvclN1cHBvcnRlZChjdXJzb3JEZXNjcmlwdGlvbiwgbWF0Y2hlcik7XG4gICAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIEFuZCB3ZSBuZWVkIHRvIGJlIGFibGUgdG8gY29tcGlsZSB0aGUgc29ydCwgaWYgYW55LiAgZWcsIGNhbid0IGJlXG4gICAgICAgIC8vIHskbmF0dXJhbDogMX0uXG4gICAgICAgIGlmICghY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5zb3J0KVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHNvcnRlciA9IG5ldyBNaW5pbW9uZ28uU29ydGVyKGN1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMuc29ydCk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBYWFggbWFrZSBhbGwgY29tcGlsYXRpb24gZXJyb3JzIE1pbmltb25nb0Vycm9yIG9yIHNvbWV0aGluZ1xuICAgICAgICAgIC8vICAgICBzbyB0aGF0IHRoaXMgZG9lc24ndCBpZ25vcmUgdW5yZWxhdGVkIGV4Y2VwdGlvbnNcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1dLCBmdW5jdGlvbiAoZikgeyByZXR1cm4gZigpOyB9KTsgIC8vIGludm9rZSBlYWNoIGZ1bmN0aW9uXG5cbiAgICB2YXIgZHJpdmVyQ2xhc3MgPSBjYW5Vc2VPcGxvZyA/IE9wbG9nT2JzZXJ2ZURyaXZlciA6IFBvbGxpbmdPYnNlcnZlRHJpdmVyO1xuICAgIG9ic2VydmVEcml2ZXIgPSBuZXcgZHJpdmVyQ2xhc3Moe1xuICAgICAgY3Vyc29yRGVzY3JpcHRpb246IGN1cnNvckRlc2NyaXB0aW9uLFxuICAgICAgbW9uZ29IYW5kbGU6IHNlbGYsXG4gICAgICBtdWx0aXBsZXhlcjogbXVsdGlwbGV4ZXIsXG4gICAgICBvcmRlcmVkOiBvcmRlcmVkLFxuICAgICAgbWF0Y2hlcjogbWF0Y2hlciwgIC8vIGlnbm9yZWQgYnkgcG9sbGluZ1xuICAgICAgc29ydGVyOiBzb3J0ZXIsICAvLyBpZ25vcmVkIGJ5IHBvbGxpbmdcbiAgICAgIF90ZXN0T25seVBvbGxDYWxsYmFjazogY2FsbGJhY2tzLl90ZXN0T25seVBvbGxDYWxsYmFja1xuICAgIH0pO1xuXG4gICAgLy8gVGhpcyBmaWVsZCBpcyBvbmx5IHNldCBmb3IgdXNlIGluIHRlc3RzLlxuICAgIG11bHRpcGxleGVyLl9vYnNlcnZlRHJpdmVyID0gb2JzZXJ2ZURyaXZlcjtcbiAgfVxuXG4gIC8vIEJsb2NrcyB1bnRpbCB0aGUgaW5pdGlhbCBhZGRzIGhhdmUgYmVlbiBzZW50LlxuICBtdWx0aXBsZXhlci5hZGRIYW5kbGVBbmRTZW5kSW5pdGlhbEFkZHMob2JzZXJ2ZUhhbmRsZSk7XG5cbiAgcmV0dXJuIG9ic2VydmVIYW5kbGU7XG59O1xuXG4vLyBMaXN0ZW4gZm9yIHRoZSBpbnZhbGlkYXRpb24gbWVzc2FnZXMgdGhhdCB3aWxsIHRyaWdnZXIgdXMgdG8gcG9sbCB0aGVcbi8vIGRhdGFiYXNlIGZvciBjaGFuZ2VzLiBJZiB0aGlzIHNlbGVjdG9yIHNwZWNpZmllcyBzcGVjaWZpYyBJRHMsIHNwZWNpZnkgdGhlbVxuLy8gaGVyZSwgc28gdGhhdCB1cGRhdGVzIHRvIGRpZmZlcmVudCBzcGVjaWZpYyBJRHMgZG9uJ3QgY2F1c2UgdXMgdG8gcG9sbC5cbi8vIGxpc3RlbkNhbGxiYWNrIGlzIHRoZSBzYW1lIGtpbmQgb2YgKG5vdGlmaWNhdGlvbiwgY29tcGxldGUpIGNhbGxiYWNrIHBhc3NlZFxuLy8gdG8gSW52YWxpZGF0aW9uQ3Jvc3NiYXIubGlzdGVuLlxuXG5saXN0ZW5BbGwgPSBmdW5jdGlvbiAoY3Vyc29yRGVzY3JpcHRpb24sIGxpc3RlbkNhbGxiYWNrKSB7XG4gIHZhciBsaXN0ZW5lcnMgPSBbXTtcbiAgZm9yRWFjaFRyaWdnZXIoY3Vyc29yRGVzY3JpcHRpb24sIGZ1bmN0aW9uICh0cmlnZ2VyKSB7XG4gICAgbGlzdGVuZXJzLnB1c2goRERQU2VydmVyLl9JbnZhbGlkYXRpb25Dcm9zc2Jhci5saXN0ZW4oXG4gICAgICB0cmlnZ2VyLCBsaXN0ZW5DYWxsYmFjaykpO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgIF8uZWFjaChsaXN0ZW5lcnMsIGZ1bmN0aW9uIChsaXN0ZW5lcikge1xuICAgICAgICBsaXN0ZW5lci5zdG9wKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG59O1xuXG5mb3JFYWNoVHJpZ2dlciA9IGZ1bmN0aW9uIChjdXJzb3JEZXNjcmlwdGlvbiwgdHJpZ2dlckNhbGxiYWNrKSB7XG4gIHZhciBrZXkgPSB7Y29sbGVjdGlvbjogY3Vyc29yRGVzY3JpcHRpb24uY29sbGVjdGlvbk5hbWV9O1xuICB2YXIgc3BlY2lmaWNJZHMgPSBMb2NhbENvbGxlY3Rpb24uX2lkc01hdGNoZWRCeVNlbGVjdG9yKFxuICAgIGN1cnNvckRlc2NyaXB0aW9uLnNlbGVjdG9yKTtcbiAgaWYgKHNwZWNpZmljSWRzKSB7XG4gICAgXy5lYWNoKHNwZWNpZmljSWRzLCBmdW5jdGlvbiAoaWQpIHtcbiAgICAgIHRyaWdnZXJDYWxsYmFjayhfLmV4dGVuZCh7aWQ6IGlkfSwga2V5KSk7XG4gICAgfSk7XG4gICAgdHJpZ2dlckNhbGxiYWNrKF8uZXh0ZW5kKHtkcm9wQ29sbGVjdGlvbjogdHJ1ZSwgaWQ6IG51bGx9LCBrZXkpKTtcbiAgfSBlbHNlIHtcbiAgICB0cmlnZ2VyQ2FsbGJhY2soa2V5KTtcbiAgfVxuICAvLyBFdmVyeW9uZSBjYXJlcyBhYm91dCB0aGUgZGF0YWJhc2UgYmVpbmcgZHJvcHBlZC5cbiAgdHJpZ2dlckNhbGxiYWNrKHsgZHJvcERhdGFiYXNlOiB0cnVlIH0pO1xufTtcblxuLy8gb2JzZXJ2ZUNoYW5nZXMgZm9yIHRhaWxhYmxlIGN1cnNvcnMgb24gY2FwcGVkIGNvbGxlY3Rpb25zLlxuLy9cbi8vIFNvbWUgZGlmZmVyZW5jZXMgZnJvbSBub3JtYWwgY3Vyc29yczpcbi8vICAgLSBXaWxsIG5ldmVyIHByb2R1Y2UgYW55dGhpbmcgb3RoZXIgdGhhbiAnYWRkZWQnIG9yICdhZGRlZEJlZm9yZScuIElmIHlvdVxuLy8gICAgIGRvIHVwZGF0ZSBhIGRvY3VtZW50IHRoYXQgaGFzIGFscmVhZHkgYmVlbiBwcm9kdWNlZCwgdGhpcyB3aWxsIG5vdCBub3RpY2Vcbi8vICAgICBpdC5cbi8vICAgLSBJZiB5b3UgZGlzY29ubmVjdCBhbmQgcmVjb25uZWN0IGZyb20gTW9uZ28sIGl0IHdpbGwgZXNzZW50aWFsbHkgcmVzdGFydFxuLy8gICAgIHRoZSBxdWVyeSwgd2hpY2ggd2lsbCBsZWFkIHRvIGR1cGxpY2F0ZSByZXN1bHRzLiBUaGlzIGlzIHByZXR0eSBiYWQsXG4vLyAgICAgYnV0IGlmIHlvdSBpbmNsdWRlIGEgZmllbGQgY2FsbGVkICd0cycgd2hpY2ggaXMgaW5zZXJ0ZWQgYXNcbi8vICAgICBuZXcgTW9uZ29JbnRlcm5hbHMuTW9uZ29UaW1lc3RhbXAoMCwgMCkgKHdoaWNoIGlzIGluaXRpYWxpemVkIHRvIHRoZVxuLy8gICAgIGN1cnJlbnQgTW9uZ28tc3R5bGUgdGltZXN0YW1wKSwgd2UnbGwgYmUgYWJsZSB0byBmaW5kIHRoZSBwbGFjZSB0b1xuLy8gICAgIHJlc3RhcnQgcHJvcGVybHkuIChUaGlzIGZpZWxkIGlzIHNwZWNpZmljYWxseSB1bmRlcnN0b29kIGJ5IE1vbmdvIHdpdGggYW5cbi8vICAgICBvcHRpbWl6YXRpb24gd2hpY2ggYWxsb3dzIGl0IHRvIGZpbmQgdGhlIHJpZ2h0IHBsYWNlIHRvIHN0YXJ0IHdpdGhvdXRcbi8vICAgICBhbiBpbmRleCBvbiB0cy4gSXQncyBob3cgdGhlIG9wbG9nIHdvcmtzLilcbi8vICAgLSBObyBjYWxsYmFja3MgYXJlIHRyaWdnZXJlZCBzeW5jaHJvbm91c2x5IHdpdGggdGhlIGNhbGwgKHRoZXJlJ3Mgbm9cbi8vICAgICBkaWZmZXJlbnRpYXRpb24gYmV0d2VlbiBcImluaXRpYWwgZGF0YVwiIGFuZCBcImxhdGVyIGNoYW5nZXNcIjsgZXZlcnl0aGluZ1xuLy8gICAgIHRoYXQgbWF0Y2hlcyB0aGUgcXVlcnkgZ2V0cyBzZW50IGFzeW5jaHJvbm91c2x5KS5cbi8vICAgLSBEZS1kdXBsaWNhdGlvbiBpcyBub3QgaW1wbGVtZW50ZWQuXG4vLyAgIC0gRG9lcyBub3QgeWV0IGludGVyYWN0IHdpdGggdGhlIHdyaXRlIGZlbmNlLiBQcm9iYWJseSwgdGhpcyBzaG91bGQgd29yayBieVxuLy8gICAgIGlnbm9yaW5nIHJlbW92ZXMgKHdoaWNoIGRvbid0IHdvcmsgb24gY2FwcGVkIGNvbGxlY3Rpb25zKSBhbmQgdXBkYXRlc1xuLy8gICAgICh3aGljaCBkb24ndCBhZmZlY3QgdGFpbGFibGUgY3Vyc29ycyksIGFuZCBqdXN0IGtlZXBpbmcgdHJhY2sgb2YgdGhlIElEXG4vLyAgICAgb2YgdGhlIGluc2VydGVkIG9iamVjdCwgYW5kIGNsb3NpbmcgdGhlIHdyaXRlIGZlbmNlIG9uY2UgeW91IGdldCB0byB0aGF0XG4vLyAgICAgSUQgKG9yIHRpbWVzdGFtcD8pLiAgVGhpcyBkb2Vzbid0IHdvcmsgd2VsbCBpZiB0aGUgZG9jdW1lbnQgZG9lc24ndCBtYXRjaFxuLy8gICAgIHRoZSBxdWVyeSwgdGhvdWdoLiAgT24gdGhlIG90aGVyIGhhbmQsIHRoZSB3cml0ZSBmZW5jZSBjYW4gY2xvc2Vcbi8vICAgICBpbW1lZGlhdGVseSBpZiBpdCBkb2VzIG5vdCBtYXRjaCB0aGUgcXVlcnkuIFNvIGlmIHdlIHRydXN0IG1pbmltb25nb1xuLy8gICAgIGVub3VnaCB0byBhY2N1cmF0ZWx5IGV2YWx1YXRlIHRoZSBxdWVyeSBhZ2FpbnN0IHRoZSB3cml0ZSBmZW5jZSwgd2Vcbi8vICAgICBzaG91bGQgYmUgYWJsZSB0byBkbyB0aGlzLi4uICBPZiBjb3Vyc2UsIG1pbmltb25nbyBkb2Vzbid0IGV2ZW4gc3VwcG9ydFxuLy8gICAgIE1vbmdvIFRpbWVzdGFtcHMgeWV0LlxuTW9uZ29Db25uZWN0aW9uLnByb3RvdHlwZS5fb2JzZXJ2ZUNoYW5nZXNUYWlsYWJsZSA9IGZ1bmN0aW9uIChcbiAgICBjdXJzb3JEZXNjcmlwdGlvbiwgb3JkZXJlZCwgY2FsbGJhY2tzKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICAvLyBUYWlsYWJsZSBjdXJzb3JzIG9ubHkgZXZlciBjYWxsIGFkZGVkL2FkZGVkQmVmb3JlIGNhbGxiYWNrcywgc28gaXQncyBhblxuICAvLyBlcnJvciBpZiB5b3UgZGlkbid0IHByb3ZpZGUgdGhlbS5cbiAgaWYgKChvcmRlcmVkICYmICFjYWxsYmFja3MuYWRkZWRCZWZvcmUpIHx8XG4gICAgICAoIW9yZGVyZWQgJiYgIWNhbGxiYWNrcy5hZGRlZCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBvYnNlcnZlIGFuIFwiICsgKG9yZGVyZWQgPyBcIm9yZGVyZWRcIiA6IFwidW5vcmRlcmVkXCIpXG4gICAgICAgICAgICAgICAgICAgICsgXCIgdGFpbGFibGUgY3Vyc29yIHdpdGhvdXQgYSBcIlxuICAgICAgICAgICAgICAgICAgICArIChvcmRlcmVkID8gXCJhZGRlZEJlZm9yZVwiIDogXCJhZGRlZFwiKSArIFwiIGNhbGxiYWNrXCIpO1xuICB9XG5cbiAgcmV0dXJuIHNlbGYudGFpbChjdXJzb3JEZXNjcmlwdGlvbiwgZnVuY3Rpb24gKGRvYykge1xuICAgIHZhciBpZCA9IGRvYy5faWQ7XG4gICAgZGVsZXRlIGRvYy5faWQ7XG4gICAgLy8gVGhlIHRzIGlzIGFuIGltcGxlbWVudGF0aW9uIGRldGFpbC4gSGlkZSBpdC5cbiAgICBkZWxldGUgZG9jLnRzO1xuICAgIGlmIChvcmRlcmVkKSB7XG4gICAgICBjYWxsYmFja3MuYWRkZWRCZWZvcmUoaWQsIGRvYywgbnVsbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbGxiYWNrcy5hZGRlZChpZCwgZG9jKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gWFhYIFdlIHByb2JhYmx5IG5lZWQgdG8gZmluZCBhIGJldHRlciB3YXkgdG8gZXhwb3NlIHRoaXMuIFJpZ2h0IG5vd1xuLy8gaXQncyBvbmx5IHVzZWQgYnkgdGVzdHMsIGJ1dCBpbiBmYWN0IHlvdSBuZWVkIGl0IGluIG5vcm1hbFxuLy8gb3BlcmF0aW9uIHRvIGludGVyYWN0IHdpdGggY2FwcGVkIGNvbGxlY3Rpb25zLlxuTW9uZ29JbnRlcm5hbHMuTW9uZ29UaW1lc3RhbXAgPSBNb25nb0RCLlRpbWVzdGFtcDtcblxuTW9uZ29JbnRlcm5hbHMuQ29ubmVjdGlvbiA9IE1vbmdvQ29ubmVjdGlvbjtcbiIsInZhciBGdXR1cmUgPSBOcG0ucmVxdWlyZSgnZmliZXJzL2Z1dHVyZScpO1xuXG5pbXBvcnQgeyBOcG1Nb2R1bGVNb25nb2RiIH0gZnJvbSBcIm1ldGVvci9ucG0tbW9uZ29cIjtcbmNvbnN0IHsgTG9uZyB9ID0gTnBtTW9kdWxlTW9uZ29kYjtcblxuT1BMT0dfQ09MTEVDVElPTiA9ICdvcGxvZy5ycyc7XG5cbnZhciBUT09fRkFSX0JFSElORCA9IHByb2Nlc3MuZW52Lk1FVEVPUl9PUExPR19UT09fRkFSX0JFSElORCB8fCAyMDAwO1xudmFyIFRBSUxfVElNRU9VVCA9ICtwcm9jZXNzLmVudi5NRVRFT1JfT1BMT0dfVEFJTF9USU1FT1VUIHx8IDMwMDAwO1xuXG52YXIgc2hvd1RTID0gZnVuY3Rpb24gKHRzKSB7XG4gIHJldHVybiBcIlRpbWVzdGFtcChcIiArIHRzLmdldEhpZ2hCaXRzKCkgKyBcIiwgXCIgKyB0cy5nZXRMb3dCaXRzKCkgKyBcIilcIjtcbn07XG5cbmlkRm9yT3AgPSBmdW5jdGlvbiAob3ApIHtcbiAgaWYgKG9wLm9wID09PSAnZCcpXG4gICAgcmV0dXJuIG9wLm8uX2lkO1xuICBlbHNlIGlmIChvcC5vcCA9PT0gJ2knKVxuICAgIHJldHVybiBvcC5vLl9pZDtcbiAgZWxzZSBpZiAob3Aub3AgPT09ICd1JylcbiAgICByZXR1cm4gb3AubzIuX2lkO1xuICBlbHNlIGlmIChvcC5vcCA9PT0gJ2MnKVxuICAgIHRocm93IEVycm9yKFwiT3BlcmF0b3IgJ2MnIGRvZXNuJ3Qgc3VwcGx5IGFuIG9iamVjdCB3aXRoIGlkOiBcIiArXG4gICAgICAgICAgICAgICAgRUpTT04uc3RyaW5naWZ5KG9wKSk7XG4gIGVsc2VcbiAgICB0aHJvdyBFcnJvcihcIlVua25vd24gb3A6IFwiICsgRUpTT04uc3RyaW5naWZ5KG9wKSk7XG59O1xuXG5PcGxvZ0hhbmRsZSA9IGZ1bmN0aW9uIChvcGxvZ1VybCwgZGJOYW1lKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgc2VsZi5fb3Bsb2dVcmwgPSBvcGxvZ1VybDtcbiAgc2VsZi5fZGJOYW1lID0gZGJOYW1lO1xuXG4gIHNlbGYuX29wbG9nTGFzdEVudHJ5Q29ubmVjdGlvbiA9IG51bGw7XG4gIHNlbGYuX29wbG9nVGFpbENvbm5lY3Rpb24gPSBudWxsO1xuICBzZWxmLl9zdG9wcGVkID0gZmFsc2U7XG4gIHNlbGYuX3RhaWxIYW5kbGUgPSBudWxsO1xuICBzZWxmLl9yZWFkeUZ1dHVyZSA9IG5ldyBGdXR1cmUoKTtcbiAgc2VsZi5fY3Jvc3NiYXIgPSBuZXcgRERQU2VydmVyLl9Dcm9zc2Jhcih7XG4gICAgZmFjdFBhY2thZ2U6IFwibW9uZ28tbGl2ZWRhdGFcIiwgZmFjdE5hbWU6IFwib3Bsb2ctd2F0Y2hlcnNcIlxuICB9KTtcbiAgc2VsZi5fYmFzZU9wbG9nU2VsZWN0b3IgPSB7XG4gICAgbnM6IG5ldyBSZWdFeHAoXCJeKD86XCIgKyBbXG4gICAgICBNZXRlb3IuX2VzY2FwZVJlZ0V4cChzZWxmLl9kYk5hbWUgKyBcIi5cIiksXG4gICAgICBNZXRlb3IuX2VzY2FwZVJlZ0V4cChcImFkbWluLiRjbWRcIiksXG4gICAgXS5qb2luKFwifFwiKSArIFwiKVwiKSxcblxuICAgICRvcjogW1xuICAgICAgeyBvcDogeyAkaW46IFsnaScsICd1JywgJ2QnXSB9IH0sXG4gICAgICAvLyBkcm9wIGNvbGxlY3Rpb25cbiAgICAgIHsgb3A6ICdjJywgJ28uZHJvcCc6IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICB7IG9wOiAnYycsICdvLmRyb3BEYXRhYmFzZSc6IDEgfSxcbiAgICAgIHsgb3A6ICdjJywgJ28uYXBwbHlPcHMnOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgIF1cbiAgfTtcblxuICAvLyBEYXRhIHN0cnVjdHVyZXMgdG8gc3VwcG9ydCB3YWl0VW50aWxDYXVnaHRVcCgpLiBFYWNoIG9wbG9nIGVudHJ5IGhhcyBhXG4gIC8vIE1vbmdvVGltZXN0YW1wIG9iamVjdCBvbiBpdCAod2hpY2ggaXMgbm90IHRoZSBzYW1lIGFzIGEgRGF0ZSAtLS0gaXQncyBhXG4gIC8vIGNvbWJpbmF0aW9uIG9mIHRpbWUgYW5kIGFuIGluY3JlbWVudGluZyBjb3VudGVyOyBzZWVcbiAgLy8gaHR0cDovL2RvY3MubW9uZ29kYi5vcmcvbWFudWFsL3JlZmVyZW5jZS9ic29uLXR5cGVzLyN0aW1lc3RhbXBzKS5cbiAgLy9cbiAgLy8gX2NhdGNoaW5nVXBGdXR1cmVzIGlzIGFuIGFycmF5IG9mIHt0czogTW9uZ29UaW1lc3RhbXAsIGZ1dHVyZTogRnV0dXJlfVxuICAvLyBvYmplY3RzLCBzb3J0ZWQgYnkgYXNjZW5kaW5nIHRpbWVzdGFtcC4gX2xhc3RQcm9jZXNzZWRUUyBpcyB0aGVcbiAgLy8gTW9uZ29UaW1lc3RhbXAgb2YgdGhlIGxhc3Qgb3Bsb2cgZW50cnkgd2UndmUgcHJvY2Vzc2VkLlxuICAvL1xuICAvLyBFYWNoIHRpbWUgd2UgY2FsbCB3YWl0VW50aWxDYXVnaHRVcCwgd2UgdGFrZSBhIHBlZWsgYXQgdGhlIGZpbmFsIG9wbG9nXG4gIC8vIGVudHJ5IGluIHRoZSBkYi4gIElmIHdlJ3ZlIGFscmVhZHkgcHJvY2Vzc2VkIGl0IChpZSwgaXQgaXMgbm90IGdyZWF0ZXIgdGhhblxuICAvLyBfbGFzdFByb2Nlc3NlZFRTKSwgd2FpdFVudGlsQ2F1Z2h0VXAgaW1tZWRpYXRlbHkgcmV0dXJucy4gT3RoZXJ3aXNlLFxuICAvLyB3YWl0VW50aWxDYXVnaHRVcCBtYWtlcyBhIG5ldyBGdXR1cmUgYW5kIGluc2VydHMgaXQgYWxvbmcgd2l0aCB0aGUgZmluYWxcbiAgLy8gdGltZXN0YW1wIGVudHJ5IHRoYXQgaXQgcmVhZCwgaW50byBfY2F0Y2hpbmdVcEZ1dHVyZXMuIHdhaXRVbnRpbENhdWdodFVwXG4gIC8vIHRoZW4gd2FpdHMgb24gdGhhdCBmdXR1cmUsIHdoaWNoIGlzIHJlc29sdmVkIG9uY2UgX2xhc3RQcm9jZXNzZWRUUyBpc1xuICAvLyBpbmNyZW1lbnRlZCB0byBiZSBwYXN0IGl0cyB0aW1lc3RhbXAgYnkgdGhlIHdvcmtlciBmaWJlci5cbiAgLy9cbiAgLy8gWFhYIHVzZSBhIHByaW9yaXR5IHF1ZXVlIG9yIHNvbWV0aGluZyBlbHNlIHRoYXQncyBmYXN0ZXIgdGhhbiBhbiBhcnJheVxuICBzZWxmLl9jYXRjaGluZ1VwRnV0dXJlcyA9IFtdO1xuICBzZWxmLl9sYXN0UHJvY2Vzc2VkVFMgPSBudWxsO1xuXG4gIHNlbGYuX29uU2tpcHBlZEVudHJpZXNIb29rID0gbmV3IEhvb2soe1xuICAgIGRlYnVnUHJpbnRFeGNlcHRpb25zOiBcIm9uU2tpcHBlZEVudHJpZXMgY2FsbGJhY2tcIlxuICB9KTtcblxuICBzZWxmLl9lbnRyeVF1ZXVlID0gbmV3IE1ldGVvci5fRG91YmxlRW5kZWRRdWV1ZSgpO1xuICBzZWxmLl93b3JrZXJBY3RpdmUgPSBmYWxzZTtcblxuICBzZWxmLl9zdGFydFRhaWxpbmcoKTtcbn07XG5cbk9iamVjdC5hc3NpZ24oT3Bsb2dIYW5kbGUucHJvdG90eXBlLCB7XG4gIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICByZXR1cm47XG4gICAgc2VsZi5fc3RvcHBlZCA9IHRydWU7XG4gICAgaWYgKHNlbGYuX3RhaWxIYW5kbGUpXG4gICAgICBzZWxmLl90YWlsSGFuZGxlLnN0b3AoKTtcbiAgICAvLyBYWFggc2hvdWxkIGNsb3NlIGNvbm5lY3Rpb25zIHRvb1xuICB9LFxuICBvbk9wbG9nRW50cnk6IGZ1bmN0aW9uICh0cmlnZ2VyLCBjYWxsYmFjaykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbGxlZCBvbk9wbG9nRW50cnkgb24gc3RvcHBlZCBoYW5kbGUhXCIpO1xuXG4gICAgLy8gQ2FsbGluZyBvbk9wbG9nRW50cnkgcmVxdWlyZXMgdXMgdG8gd2FpdCBmb3IgdGhlIHRhaWxpbmcgdG8gYmUgcmVhZHkuXG4gICAgc2VsZi5fcmVhZHlGdXR1cmUud2FpdCgpO1xuXG4gICAgdmFyIG9yaWdpbmFsQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICBjYWxsYmFjayA9IE1ldGVvci5iaW5kRW52aXJvbm1lbnQoZnVuY3Rpb24gKG5vdGlmaWNhdGlvbikge1xuICAgICAgb3JpZ2luYWxDYWxsYmFjayhub3RpZmljYXRpb24pO1xuICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIE1ldGVvci5fZGVidWcoXCJFcnJvciBpbiBvcGxvZyBjYWxsYmFja1wiLCBlcnIpO1xuICAgIH0pO1xuICAgIHZhciBsaXN0ZW5IYW5kbGUgPSBzZWxmLl9jcm9zc2Jhci5saXN0ZW4odHJpZ2dlciwgY2FsbGJhY2spO1xuICAgIHJldHVybiB7XG4gICAgICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxpc3RlbkhhbmRsZS5zdG9wKCk7XG4gICAgICB9XG4gICAgfTtcbiAgfSxcbiAgLy8gUmVnaXN0ZXIgYSBjYWxsYmFjayB0byBiZSBpbnZva2VkIGFueSB0aW1lIHdlIHNraXAgb3Bsb2cgZW50cmllcyAoZWcsXG4gIC8vIGJlY2F1c2Ugd2UgYXJlIHRvbyBmYXIgYmVoaW5kKS5cbiAgb25Ta2lwcGVkRW50cmllczogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FsbGVkIG9uU2tpcHBlZEVudHJpZXMgb24gc3RvcHBlZCBoYW5kbGUhXCIpO1xuICAgIHJldHVybiBzZWxmLl9vblNraXBwZWRFbnRyaWVzSG9vay5yZWdpc3RlcihjYWxsYmFjayk7XG4gIH0sXG4gIC8vIENhbGxzIGBjYWxsYmFja2Agb25jZSB0aGUgb3Bsb2cgaGFzIGJlZW4gcHJvY2Vzc2VkIHVwIHRvIGEgcG9pbnQgdGhhdCBpc1xuICAvLyByb3VnaGx5IFwibm93XCI6IHNwZWNpZmljYWxseSwgb25jZSB3ZSd2ZSBwcm9jZXNzZWQgYWxsIG9wcyB0aGF0IGFyZVxuICAvLyBjdXJyZW50bHkgdmlzaWJsZS5cbiAgLy8gWFhYIGJlY29tZSBjb252aW5jZWQgdGhhdCB0aGlzIGlzIGFjdHVhbGx5IHNhZmUgZXZlbiBpZiBvcGxvZ0Nvbm5lY3Rpb25cbiAgLy8gaXMgc29tZSBraW5kIG9mIHBvb2xcbiAgd2FpdFVudGlsQ2F1Z2h0VXA6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYWxsZWQgd2FpdFVudGlsQ2F1Z2h0VXAgb24gc3RvcHBlZCBoYW5kbGUhXCIpO1xuXG4gICAgLy8gQ2FsbGluZyB3YWl0VW50aWxDYXVnaHRVcCByZXF1cmllcyB1cyB0byB3YWl0IGZvciB0aGUgb3Bsb2cgY29ubmVjdGlvbiB0b1xuICAgIC8vIGJlIHJlYWR5LlxuICAgIHNlbGYuX3JlYWR5RnV0dXJlLndhaXQoKTtcbiAgICB2YXIgbGFzdEVudHJ5O1xuXG4gICAgd2hpbGUgKCFzZWxmLl9zdG9wcGVkKSB7XG4gICAgICAvLyBXZSBuZWVkIHRvIG1ha2UgdGhlIHNlbGVjdG9yIGF0IGxlYXN0IGFzIHJlc3RyaWN0aXZlIGFzIHRoZSBhY3R1YWxcbiAgICAgIC8vIHRhaWxpbmcgc2VsZWN0b3IgKGllLCB3ZSBuZWVkIHRvIHNwZWNpZnkgdGhlIERCIG5hbWUpIG9yIGVsc2Ugd2UgbWlnaHRcbiAgICAgIC8vIGZpbmQgYSBUUyB0aGF0IHdvbid0IHNob3cgdXAgaW4gdGhlIGFjdHVhbCB0YWlsIHN0cmVhbS5cbiAgICAgIHRyeSB7XG4gICAgICAgIGxhc3RFbnRyeSA9IHNlbGYuX29wbG9nTGFzdEVudHJ5Q29ubmVjdGlvbi5maW5kT25lKFxuICAgICAgICAgIE9QTE9HX0NPTExFQ1RJT04sIHNlbGYuX2Jhc2VPcGxvZ1NlbGVjdG9yLFxuICAgICAgICAgIHtmaWVsZHM6IHt0czogMX0sIHNvcnQ6IHskbmF0dXJhbDogLTF9fSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBEdXJpbmcgZmFpbG92ZXIgKGVnKSBpZiB3ZSBnZXQgYW4gZXhjZXB0aW9uIHdlIHNob3VsZCBsb2cgYW5kIHJldHJ5XG4gICAgICAgIC8vIGluc3RlYWQgb2YgY3Jhc2hpbmcuXG4gICAgICAgIE1ldGVvci5fZGVidWcoXCJHb3QgZXhjZXB0aW9uIHdoaWxlIHJlYWRpbmcgbGFzdCBlbnRyeVwiLCBlKTtcbiAgICAgICAgTWV0ZW9yLl9zbGVlcEZvck1zKDEwMCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICByZXR1cm47XG5cbiAgICBpZiAoIWxhc3RFbnRyeSkge1xuICAgICAgLy8gUmVhbGx5LCBub3RoaW5nIGluIHRoZSBvcGxvZz8gV2VsbCwgd2UndmUgcHJvY2Vzc2VkIGV2ZXJ5dGhpbmcuXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHRzID0gbGFzdEVudHJ5LnRzO1xuICAgIGlmICghdHMpXG4gICAgICB0aHJvdyBFcnJvcihcIm9wbG9nIGVudHJ5IHdpdGhvdXQgdHM6IFwiICsgRUpTT04uc3RyaW5naWZ5KGxhc3RFbnRyeSkpO1xuXG4gICAgaWYgKHNlbGYuX2xhc3RQcm9jZXNzZWRUUyAmJiB0cy5sZXNzVGhhbk9yRXF1YWwoc2VsZi5fbGFzdFByb2Nlc3NlZFRTKSkge1xuICAgICAgLy8gV2UndmUgYWxyZWFkeSBjYXVnaHQgdXAgdG8gaGVyZS5cbiAgICAgIHJldHVybjtcbiAgICB9XG5cblxuICAgIC8vIEluc2VydCB0aGUgZnV0dXJlIGludG8gb3VyIGxpc3QuIEFsbW9zdCBhbHdheXMsIHRoaXMgd2lsbCBiZSBhdCB0aGUgZW5kLFxuICAgIC8vIGJ1dCBpdCdzIGNvbmNlaXZhYmxlIHRoYXQgaWYgd2UgZmFpbCBvdmVyIGZyb20gb25lIHByaW1hcnkgdG8gYW5vdGhlcixcbiAgICAvLyB0aGUgb3Bsb2cgZW50cmllcyB3ZSBzZWUgd2lsbCBnbyBiYWNrd2FyZHMuXG4gICAgdmFyIGluc2VydEFmdGVyID0gc2VsZi5fY2F0Y2hpbmdVcEZ1dHVyZXMubGVuZ3RoO1xuICAgIHdoaWxlIChpbnNlcnRBZnRlciAtIDEgPiAwICYmIHNlbGYuX2NhdGNoaW5nVXBGdXR1cmVzW2luc2VydEFmdGVyIC0gMV0udHMuZ3JlYXRlclRoYW4odHMpKSB7XG4gICAgICBpbnNlcnRBZnRlci0tO1xuICAgIH1cbiAgICB2YXIgZiA9IG5ldyBGdXR1cmU7XG4gICAgc2VsZi5fY2F0Y2hpbmdVcEZ1dHVyZXMuc3BsaWNlKGluc2VydEFmdGVyLCAwLCB7dHM6IHRzLCBmdXR1cmU6IGZ9KTtcbiAgICBmLndhaXQoKTtcbiAgfSxcbiAgX3N0YXJ0VGFpbGluZzogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAvLyBGaXJzdCwgbWFrZSBzdXJlIHRoYXQgd2UncmUgdGFsa2luZyB0byB0aGUgbG9jYWwgZGF0YWJhc2UuXG4gICAgdmFyIG1vbmdvZGJVcmkgPSBOcG0ucmVxdWlyZSgnbW9uZ29kYi11cmknKTtcbiAgICBpZiAobW9uZ29kYlVyaS5wYXJzZShzZWxmLl9vcGxvZ1VybCkuZGF0YWJhc2UgIT09ICdsb2NhbCcpIHtcbiAgICAgIHRocm93IEVycm9yKFwiJE1PTkdPX09QTE9HX1VSTCBtdXN0IGJlIHNldCB0byB0aGUgJ2xvY2FsJyBkYXRhYmFzZSBvZiBcIiArXG4gICAgICAgICAgICAgICAgICBcImEgTW9uZ28gcmVwbGljYSBzZXRcIik7XG4gICAgfVxuXG4gICAgLy8gV2UgbWFrZSB0d28gc2VwYXJhdGUgY29ubmVjdGlvbnMgdG8gTW9uZ28uIFRoZSBOb2RlIE1vbmdvIGRyaXZlclxuICAgIC8vIGltcGxlbWVudHMgYSBuYWl2ZSByb3VuZC1yb2JpbiBjb25uZWN0aW9uIHBvb2w6IGVhY2ggXCJjb25uZWN0aW9uXCIgaXMgYVxuICAgIC8vIHBvb2wgb2Ygc2V2ZXJhbCAoNSBieSBkZWZhdWx0KSBUQ1AgY29ubmVjdGlvbnMsIGFuZCBlYWNoIHJlcXVlc3QgaXNcbiAgICAvLyByb3RhdGVkIHRocm91Z2ggdGhlIHBvb2xzLiBUYWlsYWJsZSBjdXJzb3IgcXVlcmllcyBibG9jayBvbiB0aGUgc2VydmVyXG4gICAgLy8gdW50aWwgdGhlcmUgaXMgc29tZSBkYXRhIHRvIHJldHVybiAob3IgdW50aWwgYSBmZXcgc2Vjb25kcyBoYXZlXG4gICAgLy8gcGFzc2VkKS4gU28gaWYgdGhlIGNvbm5lY3Rpb24gcG9vbCB1c2VkIGZvciB0YWlsaW5nIGN1cnNvcnMgaXMgdGhlIHNhbWVcbiAgICAvLyBwb29sIHVzZWQgZm9yIG90aGVyIHF1ZXJpZXMsIHRoZSBvdGhlciBxdWVyaWVzIHdpbGwgYmUgZGVsYXllZCBieSBzZWNvbmRzXG4gICAgLy8gMS81IG9mIHRoZSB0aW1lLlxuICAgIC8vXG4gICAgLy8gVGhlIHRhaWwgY29ubmVjdGlvbiB3aWxsIG9ubHkgZXZlciBiZSBydW5uaW5nIGEgc2luZ2xlIHRhaWwgY29tbWFuZCwgc29cbiAgICAvLyBpdCBvbmx5IG5lZWRzIHRvIG1ha2Ugb25lIHVuZGVybHlpbmcgVENQIGNvbm5lY3Rpb24uXG4gICAgc2VsZi5fb3Bsb2dUYWlsQ29ubmVjdGlvbiA9IG5ldyBNb25nb0Nvbm5lY3Rpb24oXG4gICAgICBzZWxmLl9vcGxvZ1VybCwge21heFBvb2xTaXplOiAxfSk7XG4gICAgLy8gWFhYIGJldHRlciBkb2NzLCBidXQ6IGl0J3MgdG8gZ2V0IG1vbm90b25pYyByZXN1bHRzXG4gICAgLy8gWFhYIGlzIGl0IHNhZmUgdG8gc2F5IFwiaWYgdGhlcmUncyBhbiBpbiBmbGlnaHQgcXVlcnksIGp1c3QgdXNlIGl0c1xuICAgIC8vICAgICByZXN1bHRzXCI/IEkgZG9uJ3QgdGhpbmsgc28gYnV0IHNob3VsZCBjb25zaWRlciB0aGF0XG4gICAgc2VsZi5fb3Bsb2dMYXN0RW50cnlDb25uZWN0aW9uID0gbmV3IE1vbmdvQ29ubmVjdGlvbihcbiAgICAgIHNlbGYuX29wbG9nVXJsLCB7bWF4UG9vbFNpemU6IDF9KTtcblxuICAgIC8vIE5vdywgbWFrZSBzdXJlIHRoYXQgdGhlcmUgYWN0dWFsbHkgaXMgYSByZXBsIHNldCBoZXJlLiBJZiBub3QsIG9wbG9nXG4gICAgLy8gdGFpbGluZyB3b24ndCBldmVyIGZpbmQgYW55dGhpbmchXG4gICAgLy8gTW9yZSBvbiB0aGUgaXNNYXN0ZXJEb2NcbiAgICAvLyBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9jb21tYW5kL2lzTWFzdGVyL1xuICAgIHZhciBmID0gbmV3IEZ1dHVyZTtcbiAgICBzZWxmLl9vcGxvZ0xhc3RFbnRyeUNvbm5lY3Rpb24uZGIuYWRtaW4oKS5jb21tYW5kKFxuICAgICAgeyBpc21hc3RlcjogMSB9LCBmLnJlc29sdmVyKCkpO1xuICAgIHZhciBpc01hc3RlckRvYyA9IGYud2FpdCgpO1xuXG4gICAgaWYgKCEoaXNNYXN0ZXJEb2MgJiYgaXNNYXN0ZXJEb2Muc2V0TmFtZSkpIHtcbiAgICAgIHRocm93IEVycm9yKFwiJE1PTkdPX09QTE9HX1VSTCBtdXN0IGJlIHNldCB0byB0aGUgJ2xvY2FsJyBkYXRhYmFzZSBvZiBcIiArXG4gICAgICAgICAgICAgICAgICBcImEgTW9uZ28gcmVwbGljYSBzZXRcIik7XG4gICAgfVxuXG4gICAgLy8gRmluZCB0aGUgbGFzdCBvcGxvZyBlbnRyeS5cbiAgICB2YXIgbGFzdE9wbG9nRW50cnkgPSBzZWxmLl9vcGxvZ0xhc3RFbnRyeUNvbm5lY3Rpb24uZmluZE9uZShcbiAgICAgIE9QTE9HX0NPTExFQ1RJT04sIHt9LCB7c29ydDogeyRuYXR1cmFsOiAtMX0sIGZpZWxkczoge3RzOiAxfX0pO1xuXG4gICAgdmFyIG9wbG9nU2VsZWN0b3IgPSBfLmNsb25lKHNlbGYuX2Jhc2VPcGxvZ1NlbGVjdG9yKTtcbiAgICBpZiAobGFzdE9wbG9nRW50cnkpIHtcbiAgICAgIC8vIFN0YXJ0IGFmdGVyIHRoZSBsYXN0IGVudHJ5IHRoYXQgY3VycmVudGx5IGV4aXN0cy5cbiAgICAgIG9wbG9nU2VsZWN0b3IudHMgPSB7JGd0OiBsYXN0T3Bsb2dFbnRyeS50c307XG4gICAgICAvLyBJZiB0aGVyZSBhcmUgYW55IGNhbGxzIHRvIGNhbGxXaGVuUHJvY2Vzc2VkTGF0ZXN0IGJlZm9yZSBhbnkgb3RoZXJcbiAgICAgIC8vIG9wbG9nIGVudHJpZXMgc2hvdyB1cCwgYWxsb3cgY2FsbFdoZW5Qcm9jZXNzZWRMYXRlc3QgdG8gY2FsbCBpdHNcbiAgICAgIC8vIGNhbGxiYWNrIGltbWVkaWF0ZWx5LlxuICAgICAgc2VsZi5fbGFzdFByb2Nlc3NlZFRTID0gbGFzdE9wbG9nRW50cnkudHM7XG4gICAgfVxuXG4gICAgdmFyIGN1cnNvckRlc2NyaXB0aW9uID0gbmV3IEN1cnNvckRlc2NyaXB0aW9uKFxuICAgICAgT1BMT0dfQ09MTEVDVElPTiwgb3Bsb2dTZWxlY3Rvciwge3RhaWxhYmxlOiB0cnVlfSk7XG5cbiAgICAvLyBTdGFydCB0YWlsaW5nIHRoZSBvcGxvZy5cbiAgICAvL1xuICAgIC8vIFdlIHJlc3RhcnQgdGhlIGxvdy1sZXZlbCBvcGxvZyBxdWVyeSBldmVyeSAzMCBzZWNvbmRzIGlmIHdlIGRpZG4ndCBnZXQgYVxuICAgIC8vIGRvYy4gVGhpcyBpcyBhIHdvcmthcm91bmQgZm9yICM4NTk4OiB0aGUgTm9kZSBNb25nbyBkcml2ZXIgaGFzIGF0IGxlYXN0XG4gICAgLy8gb25lIGJ1ZyB0aGF0IGNhbiBsZWFkIHRvIHF1ZXJ5IGNhbGxiYWNrcyBuZXZlciBnZXR0aW5nIGNhbGxlZCAoZXZlbiB3aXRoXG4gICAgLy8gYW4gZXJyb3IpIHdoZW4gbGVhZGVyc2hpcCBmYWlsb3ZlciBvY2N1ci5cbiAgICBzZWxmLl90YWlsSGFuZGxlID0gc2VsZi5fb3Bsb2dUYWlsQ29ubmVjdGlvbi50YWlsKFxuICAgICAgY3Vyc29yRGVzY3JpcHRpb24sXG4gICAgICBmdW5jdGlvbiAoZG9jKSB7XG4gICAgICAgIHNlbGYuX2VudHJ5UXVldWUucHVzaChkb2MpO1xuICAgICAgICBzZWxmLl9tYXliZVN0YXJ0V29ya2VyKCk7XG4gICAgICB9LFxuICAgICAgVEFJTF9USU1FT1VUXG4gICAgKTtcbiAgICBzZWxmLl9yZWFkeUZ1dHVyZS5yZXR1cm4oKTtcbiAgfSxcblxuICBfbWF5YmVTdGFydFdvcmtlcjogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoc2VsZi5fd29ya2VyQWN0aXZlKSByZXR1cm47XG4gICAgc2VsZi5fd29ya2VyQWN0aXZlID0gdHJ1ZTtcblxuICAgIE1ldGVvci5kZWZlcihmdW5jdGlvbiAoKSB7XG4gICAgICAvLyBNYXkgYmUgY2FsbGVkIHJlY3Vyc2l2ZWx5IGluIGNhc2Ugb2YgdHJhbnNhY3Rpb25zLlxuICAgICAgZnVuY3Rpb24gaGFuZGxlRG9jKGRvYykge1xuICAgICAgICBpZiAoZG9jLm5zID09PSBcImFkbWluLiRjbWRcIikge1xuICAgICAgICAgIGlmIChkb2Muby5hcHBseU9wcykge1xuICAgICAgICAgICAgLy8gVGhpcyB3YXMgYSBzdWNjZXNzZnVsIHRyYW5zYWN0aW9uLCBzbyB3ZSBuZWVkIHRvIGFwcGx5IHRoZVxuICAgICAgICAgICAgLy8gb3BlcmF0aW9ucyB0aGF0IHdlcmUgaW52b2x2ZWQuXG4gICAgICAgICAgICBsZXQgbmV4dFRpbWVzdGFtcCA9IGRvYy50cztcbiAgICAgICAgICAgIGRvYy5vLmFwcGx5T3BzLmZvckVhY2gob3AgPT4ge1xuICAgICAgICAgICAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvaXNzdWVzLzEwNDIwLlxuICAgICAgICAgICAgICBpZiAoIW9wLnRzKSB7XG4gICAgICAgICAgICAgICAgb3AudHMgPSBuZXh0VGltZXN0YW1wO1xuICAgICAgICAgICAgICAgIG5leHRUaW1lc3RhbXAgPSBuZXh0VGltZXN0YW1wLmFkZChMb25nLk9ORSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaGFuZGxlRG9jKG9wKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIGNvbW1hbmQgXCIgKyBFSlNPTi5zdHJpbmdpZnkoZG9jKSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0cmlnZ2VyID0ge1xuICAgICAgICAgIGRyb3BDb2xsZWN0aW9uOiBmYWxzZSxcbiAgICAgICAgICBkcm9wRGF0YWJhc2U6IGZhbHNlLFxuICAgICAgICAgIG9wOiBkb2MsXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHR5cGVvZiBkb2MubnMgPT09IFwic3RyaW5nXCIgJiZcbiAgICAgICAgICAgIGRvYy5ucy5zdGFydHNXaXRoKHNlbGYuX2RiTmFtZSArIFwiLlwiKSkge1xuICAgICAgICAgIHRyaWdnZXIuY29sbGVjdGlvbiA9IGRvYy5ucy5zbGljZShzZWxmLl9kYk5hbWUubGVuZ3RoICsgMSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJcyBpdCBhIHNwZWNpYWwgY29tbWFuZCBhbmQgdGhlIGNvbGxlY3Rpb24gbmFtZSBpcyBoaWRkZW5cbiAgICAgICAgLy8gc29tZXdoZXJlIGluIG9wZXJhdG9yP1xuICAgICAgICBpZiAodHJpZ2dlci5jb2xsZWN0aW9uID09PSBcIiRjbWRcIikge1xuICAgICAgICAgIGlmIChkb2Muby5kcm9wRGF0YWJhc2UpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0cmlnZ2VyLmNvbGxlY3Rpb247XG4gICAgICAgICAgICB0cmlnZ2VyLmRyb3BEYXRhYmFzZSA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIGlmIChfLmhhcyhkb2MubywgXCJkcm9wXCIpKSB7XG4gICAgICAgICAgICB0cmlnZ2VyLmNvbGxlY3Rpb24gPSBkb2Muby5kcm9wO1xuICAgICAgICAgICAgdHJpZ2dlci5kcm9wQ29sbGVjdGlvbiA9IHRydWU7XG4gICAgICAgICAgICB0cmlnZ2VyLmlkID0gbnVsbDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoXCJVbmtub3duIGNvbW1hbmQgXCIgKyBFSlNPTi5zdHJpbmdpZnkoZG9jKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gQWxsIG90aGVyIG9wcyBoYXZlIGFuIGlkLlxuICAgICAgICAgIHRyaWdnZXIuaWQgPSBpZEZvck9wKGRvYyk7XG4gICAgICAgIH1cblxuICAgICAgICBzZWxmLl9jcm9zc2Jhci5maXJlKHRyaWdnZXIpO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICB3aGlsZSAoISBzZWxmLl9zdG9wcGVkICYmXG4gICAgICAgICAgICAgICAhIHNlbGYuX2VudHJ5UXVldWUuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgLy8gQXJlIHdlIHRvbyBmYXIgYmVoaW5kPyBKdXN0IHRlbGwgb3VyIG9ic2VydmVycyB0aGF0IHRoZXkgbmVlZCB0b1xuICAgICAgICAgIC8vIHJlcG9sbCwgYW5kIGRyb3Agb3VyIHF1ZXVlLlxuICAgICAgICAgIGlmIChzZWxmLl9lbnRyeVF1ZXVlLmxlbmd0aCA+IFRPT19GQVJfQkVISU5EKSB7XG4gICAgICAgICAgICB2YXIgbGFzdEVudHJ5ID0gc2VsZi5fZW50cnlRdWV1ZS5wb3AoKTtcbiAgICAgICAgICAgIHNlbGYuX2VudHJ5UXVldWUuY2xlYXIoKTtcblxuICAgICAgICAgICAgc2VsZi5fb25Ta2lwcGVkRW50cmllc0hvb2suZWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gRnJlZSBhbnkgd2FpdFVudGlsQ2F1Z2h0VXAoKSBjYWxscyB0aGF0IHdlcmUgd2FpdGluZyBmb3IgdXMgdG9cbiAgICAgICAgICAgIC8vIHBhc3Mgc29tZXRoaW5nIHRoYXQgd2UganVzdCBza2lwcGVkLlxuICAgICAgICAgICAgc2VsZi5fc2V0TGFzdFByb2Nlc3NlZFRTKGxhc3RFbnRyeS50cyk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBkb2MgPSBzZWxmLl9lbnRyeVF1ZXVlLnNoaWZ0KCk7XG5cbiAgICAgICAgICAvLyBGaXJlIHRyaWdnZXIocykgZm9yIHRoaXMgZG9jLlxuICAgICAgICAgIGhhbmRsZURvYyhkb2MpO1xuXG4gICAgICAgICAgLy8gTm93IHRoYXQgd2UndmUgcHJvY2Vzc2VkIHRoaXMgb3BlcmF0aW9uLCBwcm9jZXNzIHBlbmRpbmdcbiAgICAgICAgICAvLyBzZXF1ZW5jZXJzLlxuICAgICAgICAgIGlmIChkb2MudHMpIHtcbiAgICAgICAgICAgIHNlbGYuX3NldExhc3RQcm9jZXNzZWRUUyhkb2MudHMpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBFcnJvcihcIm9wbG9nIGVudHJ5IHdpdGhvdXQgdHM6IFwiICsgRUpTT04uc3RyaW5naWZ5KGRvYykpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgc2VsZi5fd29ya2VyQWN0aXZlID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgX3NldExhc3RQcm9jZXNzZWRUUzogZnVuY3Rpb24gKHRzKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuX2xhc3RQcm9jZXNzZWRUUyA9IHRzO1xuICAgIHdoaWxlICghXy5pc0VtcHR5KHNlbGYuX2NhdGNoaW5nVXBGdXR1cmVzKSAmJiBzZWxmLl9jYXRjaGluZ1VwRnV0dXJlc1swXS50cy5sZXNzVGhhbk9yRXF1YWwoc2VsZi5fbGFzdFByb2Nlc3NlZFRTKSkge1xuICAgICAgdmFyIHNlcXVlbmNlciA9IHNlbGYuX2NhdGNoaW5nVXBGdXR1cmVzLnNoaWZ0KCk7XG4gICAgICBzZXF1ZW5jZXIuZnV0dXJlLnJldHVybigpO1xuICAgIH1cbiAgfSxcblxuICAvL01ldGhvZHMgdXNlZCBvbiB0ZXN0cyB0byBkaW5hbWljYWxseSBjaGFuZ2UgVE9PX0ZBUl9CRUhJTkRcbiAgX2RlZmluZVRvb0ZhckJlaGluZDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICBUT09fRkFSX0JFSElORCA9IHZhbHVlO1xuICB9LFxuICBfcmVzZXRUb29GYXJCZWhpbmQ6IGZ1bmN0aW9uKCkge1xuICAgIFRPT19GQVJfQkVISU5EID0gcHJvY2Vzcy5lbnYuTUVURU9SX09QTE9HX1RPT19GQVJfQkVISU5EIHx8IDIwMDA7XG4gIH1cbn0pO1xuIiwidmFyIEZ1dHVyZSA9IE5wbS5yZXF1aXJlKCdmaWJlcnMvZnV0dXJlJyk7XG5cbk9ic2VydmVNdWx0aXBsZXhlciA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAoIW9wdGlvbnMgfHwgIV8uaGFzKG9wdGlvbnMsICdvcmRlcmVkJykpXG4gICAgdGhyb3cgRXJyb3IoXCJtdXN0IHNwZWNpZmllZCBvcmRlcmVkXCIpO1xuXG4gIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICBcIm1vbmdvLWxpdmVkYXRhXCIsIFwib2JzZXJ2ZS1tdWx0aXBsZXhlcnNcIiwgMSk7XG5cbiAgc2VsZi5fb3JkZXJlZCA9IG9wdGlvbnMub3JkZXJlZDtcbiAgc2VsZi5fb25TdG9wID0gb3B0aW9ucy5vblN0b3AgfHwgZnVuY3Rpb24gKCkge307XG4gIHNlbGYuX3F1ZXVlID0gbmV3IE1ldGVvci5fU3luY2hyb25vdXNRdWV1ZSgpO1xuICBzZWxmLl9oYW5kbGVzID0ge307XG4gIHNlbGYuX3JlYWR5RnV0dXJlID0gbmV3IEZ1dHVyZTtcbiAgc2VsZi5fY2FjaGUgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9DYWNoaW5nQ2hhbmdlT2JzZXJ2ZXIoe1xuICAgIG9yZGVyZWQ6IG9wdGlvbnMub3JkZXJlZH0pO1xuICAvLyBOdW1iZXIgb2YgYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzIHRhc2tzIHNjaGVkdWxlZCBidXQgbm90IHlldFxuICAvLyBydW5uaW5nLiByZW1vdmVIYW5kbGUgdXNlcyB0aGlzIHRvIGtub3cgaWYgaXQncyB0aW1lIHRvIGNhbGwgdGhlIG9uU3RvcFxuICAvLyBjYWxsYmFjay5cbiAgc2VsZi5fYWRkSGFuZGxlVGFza3NTY2hlZHVsZWRCdXROb3RQZXJmb3JtZWQgPSAwO1xuXG4gIF8uZWFjaChzZWxmLmNhbGxiYWNrTmFtZXMoKSwgZnVuY3Rpb24gKGNhbGxiYWNrTmFtZSkge1xuICAgIHNlbGZbY2FsbGJhY2tOYW1lXSA9IGZ1bmN0aW9uICgvKiAuLi4gKi8pIHtcbiAgICAgIHNlbGYuX2FwcGx5Q2FsbGJhY2soY2FsbGJhY2tOYW1lLCBfLnRvQXJyYXkoYXJndW1lbnRzKSk7XG4gICAgfTtcbiAgfSk7XG59O1xuXG5fLmV4dGVuZChPYnNlcnZlTXVsdGlwbGV4ZXIucHJvdG90eXBlLCB7XG4gIGFkZEhhbmRsZUFuZFNlbmRJbml0aWFsQWRkczogZnVuY3Rpb24gKGhhbmRsZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIC8vIENoZWNrIHRoaXMgYmVmb3JlIGNhbGxpbmcgcnVuVGFzayAoZXZlbiB0aG91Z2ggcnVuVGFzayBkb2VzIHRoZSBzYW1lXG4gICAgLy8gY2hlY2spIHNvIHRoYXQgd2UgZG9uJ3QgbGVhayBhbiBPYnNlcnZlTXVsdGlwbGV4ZXIgb24gZXJyb3IgYnlcbiAgICAvLyBpbmNyZW1lbnRpbmcgX2FkZEhhbmRsZVRhc2tzU2NoZWR1bGVkQnV0Tm90UGVyZm9ybWVkIGFuZCBuZXZlclxuICAgIC8vIGRlY3JlbWVudGluZyBpdC5cbiAgICBpZiAoIXNlbGYuX3F1ZXVlLnNhZmVUb1J1blRhc2soKSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNhbGwgb2JzZXJ2ZUNoYW5nZXMgZnJvbSBhbiBvYnNlcnZlIGNhbGxiYWNrIG9uIHRoZSBzYW1lIHF1ZXJ5XCIpO1xuICAgICsrc2VsZi5fYWRkSGFuZGxlVGFza3NTY2hlZHVsZWRCdXROb3RQZXJmb3JtZWQ7XG5cbiAgICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgICBcIm1vbmdvLWxpdmVkYXRhXCIsIFwib2JzZXJ2ZS1oYW5kbGVzXCIsIDEpO1xuXG4gICAgc2VsZi5fcXVldWUucnVuVGFzayhmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9oYW5kbGVzW2hhbmRsZS5faWRdID0gaGFuZGxlO1xuICAgICAgLy8gU2VuZCBvdXQgd2hhdGV2ZXIgYWRkcyB3ZSBoYXZlIHNvIGZhciAod2hldGhlciBvciBub3Qgd2UgdGhlXG4gICAgICAvLyBtdWx0aXBsZXhlciBpcyByZWFkeSkuXG4gICAgICBzZWxmLl9zZW5kQWRkcyhoYW5kbGUpO1xuICAgICAgLS1zZWxmLl9hZGRIYW5kbGVUYXNrc1NjaGVkdWxlZEJ1dE5vdFBlcmZvcm1lZDtcbiAgICB9KTtcbiAgICAvLyAqb3V0c2lkZSogdGhlIHRhc2ssIHNpbmNlIG90aGVyd2lzZSB3ZSdkIGRlYWRsb2NrXG4gICAgc2VsZi5fcmVhZHlGdXR1cmUud2FpdCgpO1xuICB9LFxuXG4gIC8vIFJlbW92ZSBhbiBvYnNlcnZlIGhhbmRsZS4gSWYgaXQgd2FzIHRoZSBsYXN0IG9ic2VydmUgaGFuZGxlLCBjYWxsIHRoZVxuICAvLyBvblN0b3AgY2FsbGJhY2s7IHlvdSBjYW5ub3QgYWRkIGFueSBtb3JlIG9ic2VydmUgaGFuZGxlcyBhZnRlciB0aGlzLlxuICAvL1xuICAvLyBUaGlzIGlzIG5vdCBzeW5jaHJvbml6ZWQgd2l0aCBwb2xscyBhbmQgaGFuZGxlIGFkZGl0aW9uczogdGhpcyBtZWFucyB0aGF0XG4gIC8vIHlvdSBjYW4gc2FmZWx5IGNhbGwgaXQgZnJvbSB3aXRoaW4gYW4gb2JzZXJ2ZSBjYWxsYmFjaywgYnV0IGl0IGFsc28gbWVhbnNcbiAgLy8gdGhhdCB3ZSBoYXZlIHRvIGJlIGNhcmVmdWwgd2hlbiB3ZSBpdGVyYXRlIG92ZXIgX2hhbmRsZXMuXG4gIHJlbW92ZUhhbmRsZTogZnVuY3Rpb24gKGlkKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgLy8gVGhpcyBzaG91bGQgbm90IGJlIHBvc3NpYmxlOiB5b3UgY2FuIG9ubHkgY2FsbCByZW1vdmVIYW5kbGUgYnkgaGF2aW5nXG4gICAgLy8gYWNjZXNzIHRvIHRoZSBPYnNlcnZlSGFuZGxlLCB3aGljaCBpc24ndCByZXR1cm5lZCB0byB1c2VyIGNvZGUgdW50aWwgdGhlXG4gICAgLy8gbXVsdGlwbGV4IGlzIHJlYWR5LlxuICAgIGlmICghc2VsZi5fcmVhZHkoKSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHJlbW92ZSBoYW5kbGVzIHVudGlsIHRoZSBtdWx0aXBsZXggaXMgcmVhZHlcIik7XG5cbiAgICBkZWxldGUgc2VsZi5faGFuZGxlc1tpZF07XG5cbiAgICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgICBcIm1vbmdvLWxpdmVkYXRhXCIsIFwib2JzZXJ2ZS1oYW5kbGVzXCIsIC0xKTtcblxuICAgIGlmIChfLmlzRW1wdHkoc2VsZi5faGFuZGxlcykgJiZcbiAgICAgICAgc2VsZi5fYWRkSGFuZGxlVGFza3NTY2hlZHVsZWRCdXROb3RQZXJmb3JtZWQgPT09IDApIHtcbiAgICAgIHNlbGYuX3N0b3AoKTtcbiAgICB9XG4gIH0sXG4gIF9zdG9wOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIC8vIEl0IHNob3VsZG4ndCBiZSBwb3NzaWJsZSBmb3IgdXMgdG8gc3RvcCB3aGVuIGFsbCBvdXIgaGFuZGxlcyBzdGlsbFxuICAgIC8vIGhhdmVuJ3QgYmVlbiByZXR1cm5lZCBmcm9tIG9ic2VydmVDaGFuZ2VzIVxuICAgIGlmICghIHNlbGYuX3JlYWR5KCkgJiYgISBvcHRpb25zLmZyb21RdWVyeUVycm9yKVxuICAgICAgdGhyb3cgRXJyb3IoXCJzdXJwcmlzaW5nIF9zdG9wOiBub3QgcmVhZHlcIik7XG5cbiAgICAvLyBDYWxsIHN0b3AgY2FsbGJhY2sgKHdoaWNoIGtpbGxzIHRoZSB1bmRlcmx5aW5nIHByb2Nlc3Mgd2hpY2ggc2VuZHMgdXNcbiAgICAvLyBjYWxsYmFja3MgYW5kIHJlbW92ZXMgdXMgZnJvbSB0aGUgY29ubmVjdGlvbidzIGRpY3Rpb25hcnkpLlxuICAgIHNlbGYuX29uU3RvcCgpO1xuICAgIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICAgIFwibW9uZ28tbGl2ZWRhdGFcIiwgXCJvYnNlcnZlLW11bHRpcGxleGVyc1wiLCAtMSk7XG5cbiAgICAvLyBDYXVzZSBmdXR1cmUgYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzIGNhbGxzIHRvIHRocm93IChidXQgdGhlIG9uU3RvcFxuICAgIC8vIGNhbGxiYWNrIHNob3VsZCBtYWtlIG91ciBjb25uZWN0aW9uIGZvcmdldCBhYm91dCB1cykuXG4gICAgc2VsZi5faGFuZGxlcyA9IG51bGw7XG4gIH0sXG5cbiAgLy8gQWxsb3dzIGFsbCBhZGRIYW5kbGVBbmRTZW5kSW5pdGlhbEFkZHMgY2FsbHMgdG8gcmV0dXJuLCBvbmNlIGFsbCBwcmVjZWRpbmdcbiAgLy8gYWRkcyBoYXZlIGJlZW4gcHJvY2Vzc2VkLiBEb2VzIG5vdCBibG9jay5cbiAgcmVhZHk6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi5fcXVldWUucXVldWVUYXNrKGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChzZWxmLl9yZWFkeSgpKVxuICAgICAgICB0aHJvdyBFcnJvcihcImNhbid0IG1ha2UgT2JzZXJ2ZU11bHRpcGxleCByZWFkeSB0d2ljZSFcIik7XG4gICAgICBzZWxmLl9yZWFkeUZ1dHVyZS5yZXR1cm4oKTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBJZiB0cnlpbmcgdG8gZXhlY3V0ZSB0aGUgcXVlcnkgcmVzdWx0cyBpbiBhbiBlcnJvciwgY2FsbCB0aGlzLiBUaGlzIGlzXG4gIC8vIGludGVuZGVkIGZvciBwZXJtYW5lbnQgZXJyb3JzLCBub3QgdHJhbnNpZW50IG5ldHdvcmsgZXJyb3JzIHRoYXQgY291bGQgYmVcbiAgLy8gZml4ZWQuIEl0IHNob3VsZCBvbmx5IGJlIGNhbGxlZCBiZWZvcmUgcmVhZHkoKSwgYmVjYXVzZSBpZiB5b3UgY2FsbGVkIHJlYWR5XG4gIC8vIHRoYXQgbWVhbnQgdGhhdCB5b3UgbWFuYWdlZCB0byBydW4gdGhlIHF1ZXJ5IG9uY2UuIEl0IHdpbGwgc3RvcCB0aGlzXG4gIC8vIE9ic2VydmVNdWx0aXBsZXggYW5kIGNhdXNlIGFkZEhhbmRsZUFuZFNlbmRJbml0aWFsQWRkcyBjYWxscyAoYW5kIHRodXNcbiAgLy8gb2JzZXJ2ZUNoYW5nZXMgY2FsbHMpIHRvIHRocm93IHRoZSBlcnJvci5cbiAgcXVlcnlFcnJvcjogZnVuY3Rpb24gKGVycikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLl9xdWV1ZS5ydW5UYXNrKGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChzZWxmLl9yZWFkeSgpKVxuICAgICAgICB0aHJvdyBFcnJvcihcImNhbid0IGNsYWltIHF1ZXJ5IGhhcyBhbiBlcnJvciBhZnRlciBpdCB3b3JrZWQhXCIpO1xuICAgICAgc2VsZi5fc3RvcCh7ZnJvbVF1ZXJ5RXJyb3I6IHRydWV9KTtcbiAgICAgIHNlbGYuX3JlYWR5RnV0dXJlLnRocm93KGVycik7XG4gICAgfSk7XG4gIH0sXG5cbiAgLy8gQ2FsbHMgXCJjYlwiIG9uY2UgdGhlIGVmZmVjdHMgb2YgYWxsIFwicmVhZHlcIiwgXCJhZGRIYW5kbGVBbmRTZW5kSW5pdGlhbEFkZHNcIlxuICAvLyBhbmQgb2JzZXJ2ZSBjYWxsYmFja3Mgd2hpY2ggY2FtZSBiZWZvcmUgdGhpcyBjYWxsIGhhdmUgYmVlbiBwcm9wYWdhdGVkIHRvXG4gIC8vIGFsbCBoYW5kbGVzLiBcInJlYWR5XCIgbXVzdCBoYXZlIGFscmVhZHkgYmVlbiBjYWxsZWQgb24gdGhpcyBtdWx0aXBsZXhlci5cbiAgb25GbHVzaDogZnVuY3Rpb24gKGNiKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuX3F1ZXVlLnF1ZXVlVGFzayhmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoIXNlbGYuX3JlYWR5KCkpXG4gICAgICAgIHRocm93IEVycm9yKFwib25seSBjYWxsIG9uRmx1c2ggb24gYSBtdWx0aXBsZXhlciB0aGF0IHdpbGwgYmUgcmVhZHlcIik7XG4gICAgICBjYigpO1xuICAgIH0pO1xuICB9LFxuICBjYWxsYmFja05hbWVzOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9vcmRlcmVkKVxuICAgICAgcmV0dXJuIFtcImFkZGVkQmVmb3JlXCIsIFwiY2hhbmdlZFwiLCBcIm1vdmVkQmVmb3JlXCIsIFwicmVtb3ZlZFwiXTtcbiAgICBlbHNlXG4gICAgICByZXR1cm4gW1wiYWRkZWRcIiwgXCJjaGFuZ2VkXCIsIFwicmVtb3ZlZFwiXTtcbiAgfSxcbiAgX3JlYWR5OiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3JlYWR5RnV0dXJlLmlzUmVzb2x2ZWQoKTtcbiAgfSxcbiAgX2FwcGx5Q2FsbGJhY2s6IGZ1bmN0aW9uIChjYWxsYmFja05hbWUsIGFyZ3MpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi5fcXVldWUucXVldWVUYXNrKGZ1bmN0aW9uICgpIHtcbiAgICAgIC8vIElmIHdlIHN0b3BwZWQgaW4gdGhlIG1lYW50aW1lLCBkbyBub3RoaW5nLlxuICAgICAgaWYgKCFzZWxmLl9oYW5kbGVzKVxuICAgICAgICByZXR1cm47XG5cbiAgICAgIC8vIEZpcnN0LCBhcHBseSB0aGUgY2hhbmdlIHRvIHRoZSBjYWNoZS5cbiAgICAgIHNlbGYuX2NhY2hlLmFwcGx5Q2hhbmdlW2NhbGxiYWNrTmFtZV0uYXBwbHkobnVsbCwgYXJncyk7XG5cbiAgICAgIC8vIElmIHdlIGhhdmVuJ3QgZmluaXNoZWQgdGhlIGluaXRpYWwgYWRkcywgdGhlbiB3ZSBzaG91bGQgb25seSBiZSBnZXR0aW5nXG4gICAgICAvLyBhZGRzLlxuICAgICAgaWYgKCFzZWxmLl9yZWFkeSgpICYmXG4gICAgICAgICAgKGNhbGxiYWNrTmFtZSAhPT0gJ2FkZGVkJyAmJiBjYWxsYmFja05hbWUgIT09ICdhZGRlZEJlZm9yZScpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkdvdCBcIiArIGNhbGxiYWNrTmFtZSArIFwiIGR1cmluZyBpbml0aWFsIGFkZHNcIik7XG4gICAgICB9XG5cbiAgICAgIC8vIE5vdyBtdWx0aXBsZXggdGhlIGNhbGxiYWNrcyBvdXQgdG8gYWxsIG9ic2VydmUgaGFuZGxlcy4gSXQncyBPSyBpZlxuICAgICAgLy8gdGhlc2UgY2FsbHMgeWllbGQ7IHNpbmNlIHdlJ3JlIGluc2lkZSBhIHRhc2ssIG5vIG90aGVyIHVzZSBvZiBvdXIgcXVldWVcbiAgICAgIC8vIGNhbiBjb250aW51ZSB1bnRpbCB0aGVzZSBhcmUgZG9uZS4gKEJ1dCB3ZSBkbyBoYXZlIHRvIGJlIGNhcmVmdWwgdG8gbm90XG4gICAgICAvLyB1c2UgYSBoYW5kbGUgdGhhdCBnb3QgcmVtb3ZlZCwgYmVjYXVzZSByZW1vdmVIYW5kbGUgZG9lcyBub3QgdXNlIHRoZVxuICAgICAgLy8gcXVldWU7IHRodXMsIHdlIGl0ZXJhdGUgb3ZlciBhbiBhcnJheSBvZiBrZXlzIHRoYXQgd2UgY29udHJvbC4pXG4gICAgICBfLmVhY2goXy5rZXlzKHNlbGYuX2hhbmRsZXMpLCBmdW5jdGlvbiAoaGFuZGxlSWQpIHtcbiAgICAgICAgdmFyIGhhbmRsZSA9IHNlbGYuX2hhbmRsZXMgJiYgc2VsZi5faGFuZGxlc1toYW5kbGVJZF07XG4gICAgICAgIGlmICghaGFuZGxlKVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gaGFuZGxlWydfJyArIGNhbGxiYWNrTmFtZV07XG4gICAgICAgIC8vIGNsb25lIGFyZ3VtZW50cyBzbyB0aGF0IGNhbGxiYWNrcyBjYW4gbXV0YXRlIHRoZWlyIGFyZ3VtZW50c1xuICAgICAgICBjYWxsYmFjayAmJiBjYWxsYmFjay5hcHBseShudWxsLFxuICAgICAgICAgIGhhbmRsZS5ub25NdXRhdGluZ0NhbGxiYWNrcyA/IGFyZ3MgOiBFSlNPTi5jbG9uZShhcmdzKSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBTZW5kcyBpbml0aWFsIGFkZHMgdG8gYSBoYW5kbGUuIEl0IHNob3VsZCBvbmx5IGJlIGNhbGxlZCBmcm9tIHdpdGhpbiBhIHRhc2tcbiAgLy8gKHRoZSB0YXNrIHRoYXQgaXMgcHJvY2Vzc2luZyB0aGUgYWRkSGFuZGxlQW5kU2VuZEluaXRpYWxBZGRzIGNhbGwpLiBJdFxuICAvLyBzeW5jaHJvbm91c2x5IGludm9rZXMgdGhlIGhhbmRsZSdzIGFkZGVkIG9yIGFkZGVkQmVmb3JlOyB0aGVyZSdzIG5vIG5lZWQgdG9cbiAgLy8gZmx1c2ggdGhlIHF1ZXVlIGFmdGVyd2FyZHMgdG8gZW5zdXJlIHRoYXQgdGhlIGNhbGxiYWNrcyBnZXQgb3V0LlxuICBfc2VuZEFkZHM6IGZ1bmN0aW9uIChoYW5kbGUpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX3F1ZXVlLnNhZmVUb1J1blRhc2soKSlcbiAgICAgIHRocm93IEVycm9yKFwiX3NlbmRBZGRzIG1heSBvbmx5IGJlIGNhbGxlZCBmcm9tIHdpdGhpbiBhIHRhc2shXCIpO1xuICAgIHZhciBhZGQgPSBzZWxmLl9vcmRlcmVkID8gaGFuZGxlLl9hZGRlZEJlZm9yZSA6IGhhbmRsZS5fYWRkZWQ7XG4gICAgaWYgKCFhZGQpXG4gICAgICByZXR1cm47XG4gICAgLy8gbm90ZTogZG9jcyBtYXkgYmUgYW4gX0lkTWFwIG9yIGFuIE9yZGVyZWREaWN0XG4gICAgc2VsZi5fY2FjaGUuZG9jcy5mb3JFYWNoKGZ1bmN0aW9uIChkb2MsIGlkKSB7XG4gICAgICBpZiAoIV8uaGFzKHNlbGYuX2hhbmRsZXMsIGhhbmRsZS5faWQpKVxuICAgICAgICB0aHJvdyBFcnJvcihcImhhbmRsZSBnb3QgcmVtb3ZlZCBiZWZvcmUgc2VuZGluZyBpbml0aWFsIGFkZHMhXCIpO1xuICAgICAgY29uc3QgeyBfaWQsIC4uLmZpZWxkcyB9ID0gaGFuZGxlLm5vbk11dGF0aW5nQ2FsbGJhY2tzID8gZG9jXG4gICAgICAgIDogRUpTT04uY2xvbmUoZG9jKTtcbiAgICAgIGlmIChzZWxmLl9vcmRlcmVkKVxuICAgICAgICBhZGQoaWQsIGZpZWxkcywgbnVsbCk7IC8vIHdlJ3JlIGdvaW5nIGluIG9yZGVyLCBzbyBhZGQgYXQgZW5kXG4gICAgICBlbHNlXG4gICAgICAgIGFkZChpZCwgZmllbGRzKTtcbiAgICB9KTtcbiAgfVxufSk7XG5cblxudmFyIG5leHRPYnNlcnZlSGFuZGxlSWQgPSAxO1xuXG4vLyBXaGVuIHRoZSBjYWxsYmFja3MgZG8gbm90IG11dGF0ZSB0aGUgYXJndW1lbnRzLCB3ZSBjYW4gc2tpcCBhIGxvdCBvZiBkYXRhIGNsb25lc1xuT2JzZXJ2ZUhhbmRsZSA9IGZ1bmN0aW9uIChtdWx0aXBsZXhlciwgY2FsbGJhY2tzLCBub25NdXRhdGluZ0NhbGxiYWNrcyA9IGZhbHNlKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgLy8gVGhlIGVuZCB1c2VyIGlzIG9ubHkgc3VwcG9zZWQgdG8gY2FsbCBzdG9wKCkuICBUaGUgb3RoZXIgZmllbGRzIGFyZVxuICAvLyBhY2Nlc3NpYmxlIHRvIHRoZSBtdWx0aXBsZXhlciwgdGhvdWdoLlxuICBzZWxmLl9tdWx0aXBsZXhlciA9IG11bHRpcGxleGVyO1xuICBfLmVhY2gobXVsdGlwbGV4ZXIuY2FsbGJhY2tOYW1lcygpLCBmdW5jdGlvbiAobmFtZSkge1xuICAgIGlmIChjYWxsYmFja3NbbmFtZV0pIHtcbiAgICAgIHNlbGZbJ18nICsgbmFtZV0gPSBjYWxsYmFja3NbbmFtZV07XG4gICAgfSBlbHNlIGlmIChuYW1lID09PSBcImFkZGVkQmVmb3JlXCIgJiYgY2FsbGJhY2tzLmFkZGVkKSB7XG4gICAgICAvLyBTcGVjaWFsIGNhc2U6IGlmIHlvdSBzcGVjaWZ5IFwiYWRkZWRcIiBhbmQgXCJtb3ZlZEJlZm9yZVwiLCB5b3UgZ2V0IGFuXG4gICAgICAvLyBvcmRlcmVkIG9ic2VydmUgd2hlcmUgZm9yIHNvbWUgcmVhc29uIHlvdSBkb24ndCBnZXQgb3JkZXJpbmcgZGF0YSBvblxuICAgICAgLy8gdGhlIGFkZHMuICBJIGR1bm5vLCB3ZSB3cm90ZSB0ZXN0cyBmb3IgaXQsIHRoZXJlIG11c3QgaGF2ZSBiZWVuIGFcbiAgICAgIC8vIHJlYXNvbi5cbiAgICAgIHNlbGYuX2FkZGVkQmVmb3JlID0gZnVuY3Rpb24gKGlkLCBmaWVsZHMsIGJlZm9yZSkge1xuICAgICAgICBjYWxsYmFja3MuYWRkZWQoaWQsIGZpZWxkcyk7XG4gICAgICB9O1xuICAgIH1cbiAgfSk7XG4gIHNlbGYuX3N0b3BwZWQgPSBmYWxzZTtcbiAgc2VsZi5faWQgPSBuZXh0T2JzZXJ2ZUhhbmRsZUlkKys7XG4gIHNlbGYubm9uTXV0YXRpbmdDYWxsYmFja3MgPSBub25NdXRhdGluZ0NhbGxiYWNrcztcbn07XG5PYnNlcnZlSGFuZGxlLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgIHJldHVybjtcbiAgc2VsZi5fc3RvcHBlZCA9IHRydWU7XG4gIHNlbGYuX211bHRpcGxleGVyLnJlbW92ZUhhbmRsZShzZWxmLl9pZCk7XG59O1xuIiwidmFyIEZpYmVyID0gTnBtLnJlcXVpcmUoJ2ZpYmVycycpO1xuXG5leHBvcnQgY2xhc3MgRG9jRmV0Y2hlciB7XG4gIGNvbnN0cnVjdG9yKG1vbmdvQ29ubmVjdGlvbikge1xuICAgIHRoaXMuX21vbmdvQ29ubmVjdGlvbiA9IG1vbmdvQ29ubmVjdGlvbjtcbiAgICAvLyBNYXAgZnJvbSBvcCAtPiBbY2FsbGJhY2tdXG4gICAgdGhpcy5fY2FsbGJhY2tzRm9yT3AgPSBuZXcgTWFwO1xuICB9XG5cbiAgLy8gRmV0Y2hlcyBkb2N1bWVudCBcImlkXCIgZnJvbSBjb2xsZWN0aW9uTmFtZSwgcmV0dXJuaW5nIGl0IG9yIG51bGwgaWYgbm90XG4gIC8vIGZvdW5kLlxuICAvL1xuICAvLyBJZiB5b3UgbWFrZSBtdWx0aXBsZSBjYWxscyB0byBmZXRjaCgpIHdpdGggdGhlIHNhbWUgb3AgcmVmZXJlbmNlLFxuICAvLyBEb2NGZXRjaGVyIG1heSBhc3N1bWUgdGhhdCB0aGV5IGFsbCByZXR1cm4gdGhlIHNhbWUgZG9jdW1lbnQuIChJdCBkb2VzXG4gIC8vIG5vdCBjaGVjayB0byBzZWUgaWYgY29sbGVjdGlvbk5hbWUvaWQgbWF0Y2guKVxuICAvL1xuICAvLyBZb3UgbWF5IGFzc3VtZSB0aGF0IGNhbGxiYWNrIGlzIG5ldmVyIGNhbGxlZCBzeW5jaHJvbm91c2x5IChhbmQgaW4gZmFjdFxuICAvLyBPcGxvZ09ic2VydmVEcml2ZXIgZG9lcyBzbykuXG4gIGZldGNoKGNvbGxlY3Rpb25OYW1lLCBpZCwgb3AsIGNhbGxiYWNrKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBcbiAgICBjaGVjayhjb2xsZWN0aW9uTmFtZSwgU3RyaW5nKTtcbiAgICBjaGVjayhvcCwgT2JqZWN0KTtcblxuXG4gICAgLy8gSWYgdGhlcmUncyBhbHJlYWR5IGFuIGluLXByb2dyZXNzIGZldGNoIGZvciB0aGlzIGNhY2hlIGtleSwgeWllbGQgdW50aWxcbiAgICAvLyBpdCdzIGRvbmUgYW5kIHJldHVybiB3aGF0ZXZlciBpdCByZXR1cm5zLlxuICAgIGlmIChzZWxmLl9jYWxsYmFja3NGb3JPcC5oYXMob3ApKSB7XG4gICAgICBzZWxmLl9jYWxsYmFja3NGb3JPcC5nZXQob3ApLnB1c2goY2FsbGJhY2spO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNhbGxiYWNrcyA9IFtjYWxsYmFja107XG4gICAgc2VsZi5fY2FsbGJhY2tzRm9yT3Auc2V0KG9wLCBjYWxsYmFja3MpO1xuXG4gICAgRmliZXIoZnVuY3Rpb24gKCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdmFyIGRvYyA9IHNlbGYuX21vbmdvQ29ubmVjdGlvbi5maW5kT25lKFxuICAgICAgICAgIGNvbGxlY3Rpb25OYW1lLCB7X2lkOiBpZH0pIHx8IG51bGw7XG4gICAgICAgIC8vIFJldHVybiBkb2MgdG8gYWxsIHJlbGV2YW50IGNhbGxiYWNrcy4gTm90ZSB0aGF0IHRoaXMgYXJyYXkgY2FuXG4gICAgICAgIC8vIGNvbnRpbnVlIHRvIGdyb3cgZHVyaW5nIGNhbGxiYWNrIGV4Y2VjdXRpb24uXG4gICAgICAgIHdoaWxlIChjYWxsYmFja3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIENsb25lIHRoZSBkb2N1bWVudCBzbyB0aGF0IHRoZSB2YXJpb3VzIGNhbGxzIHRvIGZldGNoIGRvbid0IHJldHVyblxuICAgICAgICAgIC8vIG9iamVjdHMgdGhhdCBhcmUgaW50ZXJ0d2luZ2xlZCB3aXRoIGVhY2ggb3RoZXIuIENsb25lIGJlZm9yZVxuICAgICAgICAgIC8vIHBvcHBpbmcgdGhlIGZ1dHVyZSwgc28gdGhhdCBpZiBjbG9uZSB0aHJvd3MsIHRoZSBlcnJvciBnZXRzIHBhc3NlZFxuICAgICAgICAgIC8vIHRvIHRoZSBuZXh0IGNhbGxiYWNrLlxuICAgICAgICAgIGNhbGxiYWNrcy5wb3AoKShudWxsLCBFSlNPTi5jbG9uZShkb2MpKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB3aGlsZSAoY2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjYWxsYmFja3MucG9wKCkoZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIC8vIFhYWCBjb25zaWRlciBrZWVwaW5nIHRoZSBkb2MgYXJvdW5kIGZvciBhIHBlcmlvZCBvZiB0aW1lIGJlZm9yZVxuICAgICAgICAvLyByZW1vdmluZyBmcm9tIHRoZSBjYWNoZVxuICAgICAgICBzZWxmLl9jYWxsYmFja3NGb3JPcC5kZWxldGUob3ApO1xuICAgICAgfVxuICAgIH0pLnJ1bigpO1xuICB9XG59XG4iLCJ2YXIgUE9MTElOR19USFJPVFRMRV9NUyA9ICtwcm9jZXNzLmVudi5NRVRFT1JfUE9MTElOR19USFJPVFRMRV9NUyB8fCA1MDtcbnZhciBQT0xMSU5HX0lOVEVSVkFMX01TID0gK3Byb2Nlc3MuZW52Lk1FVEVPUl9QT0xMSU5HX0lOVEVSVkFMX01TIHx8IDEwICogMTAwMDtcblxuUG9sbGluZ09ic2VydmVEcml2ZXIgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24gPSBvcHRpb25zLmN1cnNvckRlc2NyaXB0aW9uO1xuICBzZWxmLl9tb25nb0hhbmRsZSA9IG9wdGlvbnMubW9uZ29IYW5kbGU7XG4gIHNlbGYuX29yZGVyZWQgPSBvcHRpb25zLm9yZGVyZWQ7XG4gIHNlbGYuX211bHRpcGxleGVyID0gb3B0aW9ucy5tdWx0aXBsZXhlcjtcbiAgc2VsZi5fc3RvcENhbGxiYWNrcyA9IFtdO1xuICBzZWxmLl9zdG9wcGVkID0gZmFsc2U7XG5cbiAgc2VsZi5fc3luY2hyb25vdXNDdXJzb3IgPSBzZWxmLl9tb25nb0hhbmRsZS5fY3JlYXRlU3luY2hyb25vdXNDdXJzb3IoXG4gICAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24pO1xuXG4gIC8vIHByZXZpb3VzIHJlc3VsdHMgc25hcHNob3QuICBvbiBlYWNoIHBvbGwgY3ljbGUsIGRpZmZzIGFnYWluc3RcbiAgLy8gcmVzdWx0cyBkcml2ZXMgdGhlIGNhbGxiYWNrcy5cbiAgc2VsZi5fcmVzdWx0cyA9IG51bGw7XG5cbiAgLy8gVGhlIG51bWJlciBvZiBfcG9sbE1vbmdvIGNhbGxzIHRoYXQgaGF2ZSBiZWVuIGFkZGVkIHRvIHNlbGYuX3Rhc2tRdWV1ZSBidXRcbiAgLy8gaGF2ZSBub3Qgc3RhcnRlZCBydW5uaW5nLiBVc2VkIHRvIG1ha2Ugc3VyZSB3ZSBuZXZlciBzY2hlZHVsZSBtb3JlIHRoYW4gb25lXG4gIC8vIF9wb2xsTW9uZ28gKG90aGVyIHRoYW4gcG9zc2libHkgdGhlIG9uZSB0aGF0IGlzIGN1cnJlbnRseSBydW5uaW5nKS4gSXQnc1xuICAvLyBhbHNvIHVzZWQgYnkgX3N1c3BlbmRQb2xsaW5nIHRvIHByZXRlbmQgdGhlcmUncyBhIHBvbGwgc2NoZWR1bGVkLiBVc3VhbGx5LFxuICAvLyBpdCdzIGVpdGhlciAwIChmb3IgXCJubyBwb2xscyBzY2hlZHVsZWQgb3RoZXIgdGhhbiBtYXliZSBvbmUgY3VycmVudGx5XG4gIC8vIHJ1bm5pbmdcIikgb3IgMSAoZm9yIFwiYSBwb2xsIHNjaGVkdWxlZCB0aGF0IGlzbid0IHJ1bm5pbmcgeWV0XCIpLCBidXQgaXQgY2FuXG4gIC8vIGFsc28gYmUgMiBpZiBpbmNyZW1lbnRlZCBieSBfc3VzcGVuZFBvbGxpbmcuXG4gIHNlbGYuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCA9IDA7XG4gIHNlbGYuX3BlbmRpbmdXcml0ZXMgPSBbXTsgLy8gcGVvcGxlIHRvIG5vdGlmeSB3aGVuIHBvbGxpbmcgY29tcGxldGVzXG5cbiAgLy8gTWFrZSBzdXJlIHRvIGNyZWF0ZSBhIHNlcGFyYXRlbHkgdGhyb3R0bGVkIGZ1bmN0aW9uIGZvciBlYWNoXG4gIC8vIFBvbGxpbmdPYnNlcnZlRHJpdmVyIG9iamVjdC5cbiAgc2VsZi5fZW5zdXJlUG9sbElzU2NoZWR1bGVkID0gXy50aHJvdHRsZShcbiAgICBzZWxmLl91bnRocm90dGxlZEVuc3VyZVBvbGxJc1NjaGVkdWxlZCxcbiAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLnBvbGxpbmdUaHJvdHRsZU1zIHx8IFBPTExJTkdfVEhST1RUTEVfTVMgLyogbXMgKi8pO1xuXG4gIC8vIFhYWCBmaWd1cmUgb3V0IGlmIHdlIHN0aWxsIG5lZWQgYSBxdWV1ZVxuICBzZWxmLl90YXNrUXVldWUgPSBuZXcgTWV0ZW9yLl9TeW5jaHJvbm91c1F1ZXVlKCk7XG5cbiAgdmFyIGxpc3RlbmVyc0hhbmRsZSA9IGxpc3RlbkFsbChcbiAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbiwgZnVuY3Rpb24gKG5vdGlmaWNhdGlvbikge1xuICAgICAgLy8gV2hlbiBzb21lb25lIGRvZXMgYSB0cmFuc2FjdGlvbiB0aGF0IG1pZ2h0IGFmZmVjdCB1cywgc2NoZWR1bGUgYSBwb2xsXG4gICAgICAvLyBvZiB0aGUgZGF0YWJhc2UuIElmIHRoYXQgdHJhbnNhY3Rpb24gaGFwcGVucyBpbnNpZGUgb2YgYSB3cml0ZSBmZW5jZSxcbiAgICAgIC8vIGJsb2NrIHRoZSBmZW5jZSB1bnRpbCB3ZSd2ZSBwb2xsZWQgYW5kIG5vdGlmaWVkIG9ic2VydmVycy5cbiAgICAgIHZhciBmZW5jZSA9IEREUFNlcnZlci5fQ3VycmVudFdyaXRlRmVuY2UuZ2V0KCk7XG4gICAgICBpZiAoZmVuY2UpXG4gICAgICAgIHNlbGYuX3BlbmRpbmdXcml0ZXMucHVzaChmZW5jZS5iZWdpbldyaXRlKCkpO1xuICAgICAgLy8gRW5zdXJlIGEgcG9sbCBpcyBzY2hlZHVsZWQuLi4gYnV0IGlmIHdlIGFscmVhZHkga25vdyB0aGF0IG9uZSBpcyxcbiAgICAgIC8vIGRvbid0IGhpdCB0aGUgdGhyb3R0bGVkIF9lbnN1cmVQb2xsSXNTY2hlZHVsZWQgZnVuY3Rpb24gKHdoaWNoIG1pZ2h0XG4gICAgICAvLyBsZWFkIHRvIHVzIGNhbGxpbmcgaXQgdW5uZWNlc3NhcmlseSBpbiA8cG9sbGluZ1Rocm90dGxlTXM+IG1zKS5cbiAgICAgIGlmIChzZWxmLl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQgPT09IDApXG4gICAgICAgIHNlbGYuX2Vuc3VyZVBvbGxJc1NjaGVkdWxlZCgpO1xuICAgIH1cbiAgKTtcbiAgc2VsZi5fc3RvcENhbGxiYWNrcy5wdXNoKGZ1bmN0aW9uICgpIHsgbGlzdGVuZXJzSGFuZGxlLnN0b3AoKTsgfSk7XG5cbiAgLy8gZXZlcnkgb25jZSBhbmQgYSB3aGlsZSwgcG9sbCBldmVuIGlmIHdlIGRvbid0IHRoaW5rIHdlJ3JlIGRpcnR5LCBmb3JcbiAgLy8gZXZlbnR1YWwgY29uc2lzdGVuY3kgd2l0aCBkYXRhYmFzZSB3cml0ZXMgZnJvbSBvdXRzaWRlIHRoZSBNZXRlb3JcbiAgLy8gdW5pdmVyc2UuXG4gIC8vXG4gIC8vIEZvciB0ZXN0aW5nLCB0aGVyZSdzIGFuIHVuZG9jdW1lbnRlZCBjYWxsYmFjayBhcmd1bWVudCB0byBvYnNlcnZlQ2hhbmdlc1xuICAvLyB3aGljaCBkaXNhYmxlcyB0aW1lLWJhc2VkIHBvbGxpbmcgYW5kIGdldHMgY2FsbGVkIGF0IHRoZSBiZWdpbm5pbmcgb2YgZWFjaFxuICAvLyBwb2xsLlxuICBpZiAob3B0aW9ucy5fdGVzdE9ubHlQb2xsQ2FsbGJhY2spIHtcbiAgICBzZWxmLl90ZXN0T25seVBvbGxDYWxsYmFjayA9IG9wdGlvbnMuX3Rlc3RPbmx5UG9sbENhbGxiYWNrO1xuICB9IGVsc2Uge1xuICAgIHZhciBwb2xsaW5nSW50ZXJ2YWwgPVxuICAgICAgICAgIHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMucG9sbGluZ0ludGVydmFsTXMgfHxcbiAgICAgICAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zLl9wb2xsaW5nSW50ZXJ2YWwgfHwgLy8gQ09NUEFUIHdpdGggMS4yXG4gICAgICAgICAgUE9MTElOR19JTlRFUlZBTF9NUztcbiAgICB2YXIgaW50ZXJ2YWxIYW5kbGUgPSBNZXRlb3Iuc2V0SW50ZXJ2YWwoXG4gICAgICBfLmJpbmQoc2VsZi5fZW5zdXJlUG9sbElzU2NoZWR1bGVkLCBzZWxmKSwgcG9sbGluZ0ludGVydmFsKTtcbiAgICBzZWxmLl9zdG9wQ2FsbGJhY2tzLnB1c2goZnVuY3Rpb24gKCkge1xuICAgICAgTWV0ZW9yLmNsZWFySW50ZXJ2YWwoaW50ZXJ2YWxIYW5kbGUpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTWFrZSBzdXJlIHdlIGFjdHVhbGx5IHBvbGwgc29vbiFcbiAgc2VsZi5fdW50aHJvdHRsZWRFbnN1cmVQb2xsSXNTY2hlZHVsZWQoKTtcblxuICBQYWNrYWdlWydmYWN0cy1iYXNlJ10gJiYgUGFja2FnZVsnZmFjdHMtYmFzZSddLkZhY3RzLmluY3JlbWVudFNlcnZlckZhY3QoXG4gICAgXCJtb25nby1saXZlZGF0YVwiLCBcIm9ic2VydmUtZHJpdmVycy1wb2xsaW5nXCIsIDEpO1xufTtcblxuXy5leHRlbmQoUG9sbGluZ09ic2VydmVEcml2ZXIucHJvdG90eXBlLCB7XG4gIC8vIFRoaXMgaXMgYWx3YXlzIGNhbGxlZCB0aHJvdWdoIF8udGhyb3R0bGUgKGV4Y2VwdCBvbmNlIGF0IHN0YXJ0dXApLlxuICBfdW50aHJvdHRsZWRFbnN1cmVQb2xsSXNTY2hlZHVsZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCA+IDApXG4gICAgICByZXR1cm47XG4gICAgKytzZWxmLl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQ7XG4gICAgc2VsZi5fdGFza1F1ZXVlLnF1ZXVlVGFzayhmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9wb2xsTW9uZ28oKTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyB0ZXN0LW9ubHkgaW50ZXJmYWNlIGZvciBjb250cm9sbGluZyBwb2xsaW5nLlxuICAvL1xuICAvLyBfc3VzcGVuZFBvbGxpbmcgYmxvY2tzIHVudGlsIGFueSBjdXJyZW50bHkgcnVubmluZyBhbmQgc2NoZWR1bGVkIHBvbGxzIGFyZVxuICAvLyBkb25lLCBhbmQgcHJldmVudHMgYW55IGZ1cnRoZXIgcG9sbHMgZnJvbSBiZWluZyBzY2hlZHVsZWQuIChuZXdcbiAgLy8gT2JzZXJ2ZUhhbmRsZXMgY2FuIGJlIGFkZGVkIGFuZCByZWNlaXZlIHRoZWlyIGluaXRpYWwgYWRkZWQgY2FsbGJhY2tzLFxuICAvLyB0aG91Z2guKVxuICAvL1xuICAvLyBfcmVzdW1lUG9sbGluZyBpbW1lZGlhdGVseSBwb2xscywgYW5kIGFsbG93cyBmdXJ0aGVyIHBvbGxzIHRvIG9jY3VyLlxuICBfc3VzcGVuZFBvbGxpbmc6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAvLyBQcmV0ZW5kIHRoYXQgdGhlcmUncyBhbm90aGVyIHBvbGwgc2NoZWR1bGVkICh3aGljaCB3aWxsIHByZXZlbnRcbiAgICAvLyBfZW5zdXJlUG9sbElzU2NoZWR1bGVkIGZyb20gcXVldWVpbmcgYW55IG1vcmUgcG9sbHMpLlxuICAgICsrc2VsZi5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkO1xuICAgIC8vIE5vdyBibG9jayB1bnRpbCBhbGwgY3VycmVudGx5IHJ1bm5pbmcgb3Igc2NoZWR1bGVkIHBvbGxzIGFyZSBkb25lLlxuICAgIHNlbGYuX3Rhc2tRdWV1ZS5ydW5UYXNrKGZ1bmN0aW9uKCkge30pO1xuXG4gICAgLy8gQ29uZmlybSB0aGF0IHRoZXJlIGlzIG9ubHkgb25lIFwicG9sbFwiICh0aGUgZmFrZSBvbmUgd2UncmUgcHJldGVuZGluZyB0b1xuICAgIC8vIGhhdmUpIHNjaGVkdWxlZC5cbiAgICBpZiAoc2VsZi5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkICE9PSAxKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCBpcyBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgc2VsZi5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkKTtcbiAgfSxcbiAgX3Jlc3VtZVBvbGxpbmc6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAvLyBXZSBzaG91bGQgYmUgaW4gdGhlIHNhbWUgc3RhdGUgYXMgaW4gdGhlIGVuZCBvZiBfc3VzcGVuZFBvbGxpbmcuXG4gICAgaWYgKHNlbGYuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCAhPT0gMSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIl9wb2xsc1NjaGVkdWxlZEJ1dE5vdFN0YXJ0ZWQgaXMgXCIgK1xuICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX3BvbGxzU2NoZWR1bGVkQnV0Tm90U3RhcnRlZCk7XG4gICAgLy8gUnVuIGEgcG9sbCBzeW5jaHJvbm91c2x5ICh3aGljaCB3aWxsIGNvdW50ZXJhY3QgdGhlXG4gICAgLy8gKytfcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkIGZyb20gX3N1c3BlbmRQb2xsaW5nKS5cbiAgICBzZWxmLl90YXNrUXVldWUucnVuVGFzayhmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9wb2xsTW9uZ28oKTtcbiAgICB9KTtcbiAgfSxcblxuICBfcG9sbE1vbmdvOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIC0tc2VsZi5fcG9sbHNTY2hlZHVsZWRCdXROb3RTdGFydGVkO1xuXG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICByZXR1cm47XG5cbiAgICB2YXIgZmlyc3QgPSBmYWxzZTtcbiAgICB2YXIgbmV3UmVzdWx0cztcbiAgICB2YXIgb2xkUmVzdWx0cyA9IHNlbGYuX3Jlc3VsdHM7XG4gICAgaWYgKCFvbGRSZXN1bHRzKSB7XG4gICAgICBmaXJzdCA9IHRydWU7XG4gICAgICAvLyBYWFggbWF5YmUgdXNlIE9yZGVyZWREaWN0IGluc3RlYWQ/XG4gICAgICBvbGRSZXN1bHRzID0gc2VsZi5fb3JkZXJlZCA/IFtdIDogbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gICAgfVxuXG4gICAgc2VsZi5fdGVzdE9ubHlQb2xsQ2FsbGJhY2sgJiYgc2VsZi5fdGVzdE9ubHlQb2xsQ2FsbGJhY2soKTtcblxuICAgIC8vIFNhdmUgdGhlIGxpc3Qgb2YgcGVuZGluZyB3cml0ZXMgd2hpY2ggdGhpcyByb3VuZCB3aWxsIGNvbW1pdC5cbiAgICB2YXIgd3JpdGVzRm9yQ3ljbGUgPSBzZWxmLl9wZW5kaW5nV3JpdGVzO1xuICAgIHNlbGYuX3BlbmRpbmdXcml0ZXMgPSBbXTtcblxuICAgIC8vIEdldCB0aGUgbmV3IHF1ZXJ5IHJlc3VsdHMuIChUaGlzIHlpZWxkcy4pXG4gICAgdHJ5IHtcbiAgICAgIG5ld1Jlc3VsdHMgPSBzZWxmLl9zeW5jaHJvbm91c0N1cnNvci5nZXRSYXdPYmplY3RzKHNlbGYuX29yZGVyZWQpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChmaXJzdCAmJiB0eXBlb2YoZS5jb2RlKSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgLy8gVGhpcyBpcyBhbiBlcnJvciBkb2N1bWVudCBzZW50IHRvIHVzIGJ5IG1vbmdvZCwgbm90IGEgY29ubmVjdGlvblxuICAgICAgICAvLyBlcnJvciBnZW5lcmF0ZWQgYnkgdGhlIGNsaWVudC4gQW5kIHdlJ3ZlIG5ldmVyIHNlZW4gdGhpcyBxdWVyeSB3b3JrXG4gICAgICAgIC8vIHN1Y2Nlc3NmdWxseS4gUHJvYmFibHkgaXQncyBhIGJhZCBzZWxlY3RvciBvciBzb21ldGhpbmcsIHNvIHdlIHNob3VsZFxuICAgICAgICAvLyBOT1QgcmV0cnkuIEluc3RlYWQsIHdlIHNob3VsZCBoYWx0IHRoZSBvYnNlcnZlICh3aGljaCBlbmRzIHVwIGNhbGxpbmdcbiAgICAgICAgLy8gYHN0b3BgIG9uIHVzKS5cbiAgICAgICAgc2VsZi5fbXVsdGlwbGV4ZXIucXVlcnlFcnJvcihcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBcIkV4Y2VwdGlvbiB3aGlsZSBwb2xsaW5nIHF1ZXJ5IFwiICtcbiAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24pICsgXCI6IFwiICsgZS5tZXNzYWdlKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gZ2V0UmF3T2JqZWN0cyBjYW4gdGhyb3cgaWYgd2UncmUgaGF2aW5nIHRyb3VibGUgdGFsa2luZyB0byB0aGVcbiAgICAgIC8vIGRhdGFiYXNlLiAgVGhhdCdzIGZpbmUgLS0tIHdlIHdpbGwgcmVwb2xsIGxhdGVyIGFueXdheS4gQnV0IHdlIHNob3VsZFxuICAgICAgLy8gbWFrZSBzdXJlIG5vdCB0byBsb3NlIHRyYWNrIG9mIHRoaXMgY3ljbGUncyB3cml0ZXMuXG4gICAgICAvLyAoSXQgYWxzbyBjYW4gdGhyb3cgaWYgdGhlcmUncyBqdXN0IHNvbWV0aGluZyBpbnZhbGlkIGFib3V0IHRoaXMgcXVlcnk7XG4gICAgICAvLyB1bmZvcnR1bmF0ZWx5IHRoZSBPYnNlcnZlRHJpdmVyIEFQSSBkb2Vzbid0IHByb3ZpZGUgYSBnb29kIHdheSB0b1xuICAgICAgLy8gXCJjYW5jZWxcIiB0aGUgb2JzZXJ2ZSBmcm9tIHRoZSBpbnNpZGUgaW4gdGhpcyBjYXNlLlxuICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkoc2VsZi5fcGVuZGluZ1dyaXRlcywgd3JpdGVzRm9yQ3ljbGUpO1xuICAgICAgTWV0ZW9yLl9kZWJ1ZyhcIkV4Y2VwdGlvbiB3aGlsZSBwb2xsaW5nIHF1ZXJ5IFwiICtcbiAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24pLCBlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSdW4gZGlmZnMuXG4gICAgaWYgKCFzZWxmLl9zdG9wcGVkKSB7XG4gICAgICBMb2NhbENvbGxlY3Rpb24uX2RpZmZRdWVyeUNoYW5nZXMoXG4gICAgICAgIHNlbGYuX29yZGVyZWQsIG9sZFJlc3VsdHMsIG5ld1Jlc3VsdHMsIHNlbGYuX211bHRpcGxleGVyKTtcbiAgICB9XG5cbiAgICAvLyBTaWduYWxzIHRoZSBtdWx0aXBsZXhlciB0byBhbGxvdyBhbGwgb2JzZXJ2ZUNoYW5nZXMgY2FsbHMgdGhhdCBzaGFyZSB0aGlzXG4gICAgLy8gbXVsdGlwbGV4ZXIgdG8gcmV0dXJuLiAoVGhpcyBoYXBwZW5zIGFzeW5jaHJvbm91c2x5LCB2aWEgdGhlXG4gICAgLy8gbXVsdGlwbGV4ZXIncyBxdWV1ZS4pXG4gICAgaWYgKGZpcnN0KVxuICAgICAgc2VsZi5fbXVsdGlwbGV4ZXIucmVhZHkoKTtcblxuICAgIC8vIFJlcGxhY2Ugc2VsZi5fcmVzdWx0cyBhdG9taWNhbGx5LiAgKFRoaXMgYXNzaWdubWVudCBpcyB3aGF0IG1ha2VzIGBmaXJzdGBcbiAgICAvLyBzdGF5IHRocm91Z2ggb24gdGhlIG5leHQgY3ljbGUsIHNvIHdlJ3ZlIHdhaXRlZCB1bnRpbCBhZnRlciB3ZSd2ZVxuICAgIC8vIGNvbW1pdHRlZCB0byByZWFkeS1pbmcgdGhlIG11bHRpcGxleGVyLilcbiAgICBzZWxmLl9yZXN1bHRzID0gbmV3UmVzdWx0cztcblxuICAgIC8vIE9uY2UgdGhlIE9ic2VydmVNdWx0aXBsZXhlciBoYXMgcHJvY2Vzc2VkIGV2ZXJ5dGhpbmcgd2UndmUgZG9uZSBpbiB0aGlzXG4gICAgLy8gcm91bmQsIG1hcmsgYWxsIHRoZSB3cml0ZXMgd2hpY2ggZXhpc3RlZCBiZWZvcmUgdGhpcyBjYWxsIGFzXG4gICAgLy8gY29tbW1pdHRlZC4gKElmIG5ldyB3cml0ZXMgaGF2ZSBzaG93biB1cCBpbiB0aGUgbWVhbnRpbWUsIHRoZXJlJ2xsXG4gICAgLy8gYWxyZWFkeSBiZSBhbm90aGVyIF9wb2xsTW9uZ28gdGFzayBzY2hlZHVsZWQuKVxuICAgIHNlbGYuX211bHRpcGxleGVyLm9uRmx1c2goZnVuY3Rpb24gKCkge1xuICAgICAgXy5lYWNoKHdyaXRlc0ZvckN5Y2xlLCBmdW5jdGlvbiAodykge1xuICAgICAgICB3LmNvbW1pdHRlZCgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0sXG5cbiAgc3RvcDogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBzZWxmLl9zdG9wcGVkID0gdHJ1ZTtcbiAgICBfLmVhY2goc2VsZi5fc3RvcENhbGxiYWNrcywgZnVuY3Rpb24gKGMpIHsgYygpOyB9KTtcbiAgICAvLyBSZWxlYXNlIGFueSB3cml0ZSBmZW5jZXMgdGhhdCBhcmUgd2FpdGluZyBvbiB1cy5cbiAgICBfLmVhY2goc2VsZi5fcGVuZGluZ1dyaXRlcywgZnVuY3Rpb24gKHcpIHtcbiAgICAgIHcuY29tbWl0dGVkKCk7XG4gICAgfSk7XG4gICAgUGFja2FnZVsnZmFjdHMtYmFzZSddICYmIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXS5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFxuICAgICAgXCJtb25nby1saXZlZGF0YVwiLCBcIm9ic2VydmUtZHJpdmVycy1wb2xsaW5nXCIsIC0xKTtcbiAgfVxufSk7XG4iLCJpbXBvcnQgeyBvcGxvZ1YyVjFDb252ZXJ0ZXIgfSBmcm9tIFwiLi9vcGxvZ192Ml9jb252ZXJ0ZXJcIjtcblxudmFyIEZ1dHVyZSA9IE5wbS5yZXF1aXJlKCdmaWJlcnMvZnV0dXJlJyk7XG5cbnZhciBQSEFTRSA9IHtcbiAgUVVFUllJTkc6IFwiUVVFUllJTkdcIixcbiAgRkVUQ0hJTkc6IFwiRkVUQ0hJTkdcIixcbiAgU1RFQURZOiBcIlNURUFEWVwiXG59O1xuXG4vLyBFeGNlcHRpb24gdGhyb3duIGJ5IF9uZWVkVG9Qb2xsUXVlcnkgd2hpY2ggdW5yb2xscyB0aGUgc3RhY2sgdXAgdG8gdGhlXG4vLyBlbmNsb3NpbmcgY2FsbCB0byBmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeS5cbnZhciBTd2l0Y2hlZFRvUXVlcnkgPSBmdW5jdGlvbiAoKSB7fTtcbnZhciBmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeSA9IGZ1bmN0aW9uIChmKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGYuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoIShlIGluc3RhbmNlb2YgU3dpdGNoZWRUb1F1ZXJ5KSlcbiAgICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH07XG59O1xuXG52YXIgY3VycmVudElkID0gMDtcblxuLy8gT3Bsb2dPYnNlcnZlRHJpdmVyIGlzIGFuIGFsdGVybmF0aXZlIHRvIFBvbGxpbmdPYnNlcnZlRHJpdmVyIHdoaWNoIGZvbGxvd3Ncbi8vIHRoZSBNb25nbyBvcGVyYXRpb24gbG9nIGluc3RlYWQgb2YganVzdCByZS1wb2xsaW5nIHRoZSBxdWVyeS4gSXQgb2JleXMgdGhlXG4vLyBzYW1lIHNpbXBsZSBpbnRlcmZhY2U6IGNvbnN0cnVjdGluZyBpdCBzdGFydHMgc2VuZGluZyBvYnNlcnZlQ2hhbmdlc1xuLy8gY2FsbGJhY2tzIChhbmQgYSByZWFkeSgpIGludm9jYXRpb24pIHRvIHRoZSBPYnNlcnZlTXVsdGlwbGV4ZXIsIGFuZCB5b3Ugc3RvcFxuLy8gaXQgYnkgY2FsbGluZyB0aGUgc3RvcCgpIG1ldGhvZC5cbk9wbG9nT2JzZXJ2ZURyaXZlciA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgc2VsZi5fdXNlc09wbG9nID0gdHJ1ZTsgIC8vIHRlc3RzIGxvb2sgYXQgdGhpc1xuXG4gIHNlbGYuX2lkID0gY3VycmVudElkO1xuICBjdXJyZW50SWQrKztcblxuICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbiA9IG9wdGlvbnMuY3Vyc29yRGVzY3JpcHRpb247XG4gIHNlbGYuX21vbmdvSGFuZGxlID0gb3B0aW9ucy5tb25nb0hhbmRsZTtcbiAgc2VsZi5fbXVsdGlwbGV4ZXIgPSBvcHRpb25zLm11bHRpcGxleGVyO1xuXG4gIGlmIChvcHRpb25zLm9yZGVyZWQpIHtcbiAgICB0aHJvdyBFcnJvcihcIk9wbG9nT2JzZXJ2ZURyaXZlciBvbmx5IHN1cHBvcnRzIHVub3JkZXJlZCBvYnNlcnZlQ2hhbmdlc1wiKTtcbiAgfVxuXG4gIHZhciBzb3J0ZXIgPSBvcHRpb25zLnNvcnRlcjtcbiAgLy8gV2UgZG9uJ3Qgc3VwcG9ydCAkbmVhciBhbmQgb3RoZXIgZ2VvLXF1ZXJpZXMgc28gaXQncyBPSyB0byBpbml0aWFsaXplIHRoZVxuICAvLyBjb21wYXJhdG9yIG9ubHkgb25jZSBpbiB0aGUgY29uc3RydWN0b3IuXG4gIHZhciBjb21wYXJhdG9yID0gc29ydGVyICYmIHNvcnRlci5nZXRDb21wYXJhdG9yKCk7XG5cbiAgaWYgKG9wdGlvbnMuY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucy5saW1pdCkge1xuICAgIC8vIFRoZXJlIGFyZSBzZXZlcmFsIHByb3BlcnRpZXMgb3JkZXJlZCBkcml2ZXIgaW1wbGVtZW50czpcbiAgICAvLyAtIF9saW1pdCBpcyBhIHBvc2l0aXZlIG51bWJlclxuICAgIC8vIC0gX2NvbXBhcmF0b3IgaXMgYSBmdW5jdGlvbi1jb21wYXJhdG9yIGJ5IHdoaWNoIHRoZSBxdWVyeSBpcyBvcmRlcmVkXG4gICAgLy8gLSBfdW5wdWJsaXNoZWRCdWZmZXIgaXMgbm9uLW51bGwgTWluL01heCBIZWFwLFxuICAgIC8vICAgICAgICAgICAgICAgICAgICAgIHRoZSBlbXB0eSBidWZmZXIgaW4gU1RFQURZIHBoYXNlIGltcGxpZXMgdGhhdCB0aGVcbiAgICAvLyAgICAgICAgICAgICAgICAgICAgICBldmVyeXRoaW5nIHRoYXQgbWF0Y2hlcyB0aGUgcXVlcmllcyBzZWxlY3RvciBmaXRzXG4gICAgLy8gICAgICAgICAgICAgICAgICAgICAgaW50byBwdWJsaXNoZWQgc2V0LlxuICAgIC8vIC0gX3B1Ymxpc2hlZCAtIE1heCBIZWFwIChhbHNvIGltcGxlbWVudHMgSWRNYXAgbWV0aG9kcylcblxuICAgIHZhciBoZWFwT3B0aW9ucyA9IHsgSWRNYXA6IExvY2FsQ29sbGVjdGlvbi5fSWRNYXAgfTtcbiAgICBzZWxmLl9saW1pdCA9IHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMubGltaXQ7XG4gICAgc2VsZi5fY29tcGFyYXRvciA9IGNvbXBhcmF0b3I7XG4gICAgc2VsZi5fc29ydGVyID0gc29ydGVyO1xuICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyID0gbmV3IE1pbk1heEhlYXAoY29tcGFyYXRvciwgaGVhcE9wdGlvbnMpO1xuICAgIC8vIFdlIG5lZWQgc29tZXRoaW5nIHRoYXQgY2FuIGZpbmQgTWF4IHZhbHVlIGluIGFkZGl0aW9uIHRvIElkTWFwIGludGVyZmFjZVxuICAgIHNlbGYuX3B1Ymxpc2hlZCA9IG5ldyBNYXhIZWFwKGNvbXBhcmF0b3IsIGhlYXBPcHRpb25zKTtcbiAgfSBlbHNlIHtcbiAgICBzZWxmLl9saW1pdCA9IDA7XG4gICAgc2VsZi5fY29tcGFyYXRvciA9IG51bGw7XG4gICAgc2VsZi5fc29ydGVyID0gbnVsbDtcbiAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlciA9IG51bGw7XG4gICAgc2VsZi5fcHVibGlzaGVkID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gIH1cblxuICAvLyBJbmRpY2F0ZXMgaWYgaXQgaXMgc2FmZSB0byBpbnNlcnQgYSBuZXcgZG9jdW1lbnQgYXQgdGhlIGVuZCBvZiB0aGUgYnVmZmVyXG4gIC8vIGZvciB0aGlzIHF1ZXJ5LiBpLmUuIGl0IGlzIGtub3duIHRoYXQgdGhlcmUgYXJlIG5vIGRvY3VtZW50cyBtYXRjaGluZyB0aGVcbiAgLy8gc2VsZWN0b3IgdGhvc2UgYXJlIG5vdCBpbiBwdWJsaXNoZWQgb3IgYnVmZmVyLlxuICBzZWxmLl9zYWZlQXBwZW5kVG9CdWZmZXIgPSBmYWxzZTtcblxuICBzZWxmLl9zdG9wcGVkID0gZmFsc2U7XG4gIHNlbGYuX3N0b3BIYW5kbGVzID0gW107XG5cbiAgUGFja2FnZVsnZmFjdHMtYmFzZSddICYmIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXS5GYWN0cy5pbmNyZW1lbnRTZXJ2ZXJGYWN0KFxuICAgIFwibW9uZ28tbGl2ZWRhdGFcIiwgXCJvYnNlcnZlLWRyaXZlcnMtb3Bsb2dcIiwgMSk7XG5cbiAgc2VsZi5fcmVnaXN0ZXJQaGFzZUNoYW5nZShQSEFTRS5RVUVSWUlORyk7XG5cbiAgc2VsZi5fbWF0Y2hlciA9IG9wdGlvbnMubWF0Y2hlcjtcbiAgLy8gd2UgYXJlIG5vdyB1c2luZyBwcm9qZWN0aW9uLCBub3QgZmllbGRzIGluIHRoZSBjdXJzb3IgZGVzY3JpcHRpb24gZXZlbiBpZiB5b3UgcGFzcyB7ZmllbGRzfVxuICAvLyBpbiB0aGUgY3Vyc29yIGNvbnN0cnVjdGlvblxuICB2YXIgcHJvamVjdGlvbiA9IHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMuZmllbGRzIHx8IHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLm9wdGlvbnMucHJvamVjdGlvbiB8fCB7fTtcbiAgc2VsZi5fcHJvamVjdGlvbkZuID0gTG9jYWxDb2xsZWN0aW9uLl9jb21waWxlUHJvamVjdGlvbihwcm9qZWN0aW9uKTtcbiAgLy8gUHJvamVjdGlvbiBmdW5jdGlvbiwgcmVzdWx0IG9mIGNvbWJpbmluZyBpbXBvcnRhbnQgZmllbGRzIGZvciBzZWxlY3RvciBhbmRcbiAgLy8gZXhpc3RpbmcgZmllbGRzIHByb2plY3Rpb25cbiAgc2VsZi5fc2hhcmVkUHJvamVjdGlvbiA9IHNlbGYuX21hdGNoZXIuY29tYmluZUludG9Qcm9qZWN0aW9uKHByb2plY3Rpb24pO1xuICBpZiAoc29ydGVyKVxuICAgIHNlbGYuX3NoYXJlZFByb2plY3Rpb24gPSBzb3J0ZXIuY29tYmluZUludG9Qcm9qZWN0aW9uKHNlbGYuX3NoYXJlZFByb2plY3Rpb24pO1xuICBzZWxmLl9zaGFyZWRQcm9qZWN0aW9uRm4gPSBMb2NhbENvbGxlY3Rpb24uX2NvbXBpbGVQcm9qZWN0aW9uKFxuICAgIHNlbGYuX3NoYXJlZFByb2plY3Rpb24pO1xuXG4gIHNlbGYuX25lZWRUb0ZldGNoID0gbmV3IExvY2FsQ29sbGVjdGlvbi5fSWRNYXA7XG4gIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nID0gbnVsbDtcbiAgc2VsZi5fZmV0Y2hHZW5lcmF0aW9uID0gMDtcblxuICBzZWxmLl9yZXF1ZXJ5V2hlbkRvbmVUaGlzUXVlcnkgPSBmYWxzZTtcbiAgc2VsZi5fd3JpdGVzVG9Db21taXRXaGVuV2VSZWFjaFN0ZWFkeSA9IFtdO1xuXG4gIC8vIElmIHRoZSBvcGxvZyBoYW5kbGUgdGVsbHMgdXMgdGhhdCBpdCBza2lwcGVkIHNvbWUgZW50cmllcyAoYmVjYXVzZSBpdCBnb3RcbiAgLy8gYmVoaW5kLCBzYXkpLCByZS1wb2xsLlxuICBzZWxmLl9zdG9wSGFuZGxlcy5wdXNoKHNlbGYuX21vbmdvSGFuZGxlLl9vcGxvZ0hhbmRsZS5vblNraXBwZWRFbnRyaWVzKFxuICAgIGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5KGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX25lZWRUb1BvbGxRdWVyeSgpO1xuICAgIH0pXG4gICkpO1xuXG4gIGZvckVhY2hUcmlnZ2VyKHNlbGYuX2N1cnNvckRlc2NyaXB0aW9uLCBmdW5jdGlvbiAodHJpZ2dlcikge1xuICAgIHNlbGYuX3N0b3BIYW5kbGVzLnB1c2goc2VsZi5fbW9uZ29IYW5kbGUuX29wbG9nSGFuZGxlLm9uT3Bsb2dFbnRyeShcbiAgICAgIHRyaWdnZXIsIGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgICAgICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHZhciBvcCA9IG5vdGlmaWNhdGlvbi5vcDtcbiAgICAgICAgICBpZiAobm90aWZpY2F0aW9uLmRyb3BDb2xsZWN0aW9uIHx8IG5vdGlmaWNhdGlvbi5kcm9wRGF0YWJhc2UpIHtcbiAgICAgICAgICAgIC8vIE5vdGU6IHRoaXMgY2FsbCBpcyBub3QgYWxsb3dlZCB0byBibG9jayBvbiBhbnl0aGluZyAoZXNwZWNpYWxseVxuICAgICAgICAgICAgLy8gb24gd2FpdGluZyBmb3Igb3Bsb2cgZW50cmllcyB0byBjYXRjaCB1cCkgYmVjYXVzZSB0aGF0IHdpbGwgYmxvY2tcbiAgICAgICAgICAgIC8vIG9uT3Bsb2dFbnRyeSFcbiAgICAgICAgICAgIHNlbGYuX25lZWRUb1BvbGxRdWVyeSgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBBbGwgb3RoZXIgb3BlcmF0b3JzIHNob3VsZCBiZSBoYW5kbGVkIGRlcGVuZGluZyBvbiBwaGFzZVxuICAgICAgICAgICAgaWYgKHNlbGYuX3BoYXNlID09PSBQSEFTRS5RVUVSWUlORykge1xuICAgICAgICAgICAgICBzZWxmLl9oYW5kbGVPcGxvZ0VudHJ5UXVlcnlpbmcob3ApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgc2VsZi5faGFuZGxlT3Bsb2dFbnRyeVN0ZWFkeU9yRmV0Y2hpbmcob3ApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSkpO1xuICAgICAgfVxuICAgICkpO1xuICB9KTtcblxuICAvLyBYWFggb3JkZXJpbmcgdy5yLnQuIGV2ZXJ5dGhpbmcgZWxzZT9cbiAgc2VsZi5fc3RvcEhhbmRsZXMucHVzaChsaXN0ZW5BbGwoXG4gICAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24sIGZ1bmN0aW9uIChub3RpZmljYXRpb24pIHtcbiAgICAgIC8vIElmIHdlJ3JlIG5vdCBpbiBhIHByZS1maXJlIHdyaXRlIGZlbmNlLCB3ZSBkb24ndCBoYXZlIHRvIGRvIGFueXRoaW5nLlxuICAgICAgdmFyIGZlbmNlID0gRERQU2VydmVyLl9DdXJyZW50V3JpdGVGZW5jZS5nZXQoKTtcbiAgICAgIGlmICghZmVuY2UgfHwgZmVuY2UuZmlyZWQpXG4gICAgICAgIHJldHVybjtcblxuICAgICAgaWYgKGZlbmNlLl9vcGxvZ09ic2VydmVEcml2ZXJzKSB7XG4gICAgICAgIGZlbmNlLl9vcGxvZ09ic2VydmVEcml2ZXJzW3NlbGYuX2lkXSA9IHNlbGY7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZmVuY2UuX29wbG9nT2JzZXJ2ZURyaXZlcnMgPSB7fTtcbiAgICAgIGZlbmNlLl9vcGxvZ09ic2VydmVEcml2ZXJzW3NlbGYuX2lkXSA9IHNlbGY7XG5cbiAgICAgIGZlbmNlLm9uQmVmb3JlRmlyZShmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkcml2ZXJzID0gZmVuY2UuX29wbG9nT2JzZXJ2ZURyaXZlcnM7XG4gICAgICAgIGRlbGV0ZSBmZW5jZS5fb3Bsb2dPYnNlcnZlRHJpdmVycztcblxuICAgICAgICAvLyBUaGlzIGZlbmNlIGNhbm5vdCBmaXJlIHVudGlsIHdlJ3ZlIGNhdWdodCB1cCB0byBcInRoaXMgcG9pbnRcIiBpbiB0aGVcbiAgICAgICAgLy8gb3Bsb2csIGFuZCBhbGwgb2JzZXJ2ZXJzIG1hZGUgaXQgYmFjayB0byB0aGUgc3RlYWR5IHN0YXRlLlxuICAgICAgICBzZWxmLl9tb25nb0hhbmRsZS5fb3Bsb2dIYW5kbGUud2FpdFVudGlsQ2F1Z2h0VXAoKTtcblxuICAgICAgICBfLmVhY2goZHJpdmVycywgZnVuY3Rpb24gKGRyaXZlcikge1xuICAgICAgICAgIGlmIChkcml2ZXIuX3N0b3BwZWQpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICB2YXIgd3JpdGUgPSBmZW5jZS5iZWdpbldyaXRlKCk7XG4gICAgICAgICAgaWYgKGRyaXZlci5fcGhhc2UgPT09IFBIQVNFLlNURUFEWSkge1xuICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHRoYXQgYWxsIG9mIHRoZSBjYWxsYmFja3MgaGF2ZSBtYWRlIGl0IHRocm91Z2ggdGhlXG4gICAgICAgICAgICAvLyBtdWx0aXBsZXhlciBhbmQgYmVlbiBkZWxpdmVyZWQgdG8gT2JzZXJ2ZUhhbmRsZXMgYmVmb3JlIGNvbW1pdHRpbmdcbiAgICAgICAgICAgIC8vIHdyaXRlcy5cbiAgICAgICAgICAgIGRyaXZlci5fbXVsdGlwbGV4ZXIub25GbHVzaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHdyaXRlLmNvbW1pdHRlZCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRyaXZlci5fd3JpdGVzVG9Db21taXRXaGVuV2VSZWFjaFN0ZWFkeS5wdXNoKHdyaXRlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuICApKTtcblxuICAvLyBXaGVuIE1vbmdvIGZhaWxzIG92ZXIsIHdlIG5lZWQgdG8gcmVwb2xsIHRoZSBxdWVyeSwgaW4gY2FzZSB3ZSBwcm9jZXNzZWQgYW5cbiAgLy8gb3Bsb2cgZW50cnkgdGhhdCBnb3Qgcm9sbGVkIGJhY2suXG4gIHNlbGYuX3N0b3BIYW5kbGVzLnB1c2goc2VsZi5fbW9uZ29IYW5kbGUuX29uRmFpbG92ZXIoZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnkoXG4gICAgZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5fbmVlZFRvUG9sbFF1ZXJ5KCk7XG4gICAgfSkpKTtcblxuICAvLyBHaXZlIF9vYnNlcnZlQ2hhbmdlcyBhIGNoYW5jZSB0byBhZGQgdGhlIG5ldyBPYnNlcnZlSGFuZGxlIHRvIG91clxuICAvLyBtdWx0aXBsZXhlciwgc28gdGhhdCB0aGUgYWRkZWQgY2FsbHMgZ2V0IHN0cmVhbWVkLlxuICBNZXRlb3IuZGVmZXIoZmluaXNoSWZOZWVkVG9Qb2xsUXVlcnkoZnVuY3Rpb24gKCkge1xuICAgIHNlbGYuX3J1bkluaXRpYWxRdWVyeSgpO1xuICB9KSk7XG59O1xuXG5fLmV4dGVuZChPcGxvZ09ic2VydmVEcml2ZXIucHJvdG90eXBlLCB7XG4gIF9hZGRQdWJsaXNoZWQ6IGZ1bmN0aW9uIChpZCwgZG9jKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBmaWVsZHMgPSBfLmNsb25lKGRvYyk7XG4gICAgICBkZWxldGUgZmllbGRzLl9pZDtcbiAgICAgIHNlbGYuX3B1Ymxpc2hlZC5zZXQoaWQsIHNlbGYuX3NoYXJlZFByb2plY3Rpb25Gbihkb2MpKTtcbiAgICAgIHNlbGYuX211bHRpcGxleGVyLmFkZGVkKGlkLCBzZWxmLl9wcm9qZWN0aW9uRm4oZmllbGRzKSk7XG5cbiAgICAgIC8vIEFmdGVyIGFkZGluZyB0aGlzIGRvY3VtZW50LCB0aGUgcHVibGlzaGVkIHNldCBtaWdodCBiZSBvdmVyZmxvd2VkXG4gICAgICAvLyAoZXhjZWVkaW5nIGNhcGFjaXR5IHNwZWNpZmllZCBieSBsaW1pdCkuIElmIHNvLCBwdXNoIHRoZSBtYXhpbXVtXG4gICAgICAvLyBlbGVtZW50IHRvIHRoZSBidWZmZXIsIHdlIG1pZ2h0IHdhbnQgdG8gc2F2ZSBpdCBpbiBtZW1vcnkgdG8gcmVkdWNlIHRoZVxuICAgICAgLy8gYW1vdW50IG9mIE1vbmdvIGxvb2t1cHMgaW4gdGhlIGZ1dHVyZS5cbiAgICAgIGlmIChzZWxmLl9saW1pdCAmJiBzZWxmLl9wdWJsaXNoZWQuc2l6ZSgpID4gc2VsZi5fbGltaXQpIHtcbiAgICAgICAgLy8gWFhYIGluIHRoZW9yeSB0aGUgc2l6ZSBvZiBwdWJsaXNoZWQgaXMgbm8gbW9yZSB0aGFuIGxpbWl0KzFcbiAgICAgICAgaWYgKHNlbGYuX3B1Ymxpc2hlZC5zaXplKCkgIT09IHNlbGYuX2xpbWl0ICsgMSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkFmdGVyIGFkZGluZyB0byBwdWJsaXNoZWQsIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgKHNlbGYuX3B1Ymxpc2hlZC5zaXplKCkgLSBzZWxmLl9saW1pdCkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICBcIiBkb2N1bWVudHMgYXJlIG92ZXJmbG93aW5nIHRoZSBzZXRcIik7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb3ZlcmZsb3dpbmdEb2NJZCA9IHNlbGYuX3B1Ymxpc2hlZC5tYXhFbGVtZW50SWQoKTtcbiAgICAgICAgdmFyIG92ZXJmbG93aW5nRG9jID0gc2VsZi5fcHVibGlzaGVkLmdldChvdmVyZmxvd2luZ0RvY0lkKTtcblxuICAgICAgICBpZiAoRUpTT04uZXF1YWxzKG92ZXJmbG93aW5nRG9jSWQsIGlkKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSBkb2N1bWVudCBqdXN0IGFkZGVkIGlzIG92ZXJmbG93aW5nIHRoZSBwdWJsaXNoZWQgc2V0XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgc2VsZi5fcHVibGlzaGVkLnJlbW92ZShvdmVyZmxvd2luZ0RvY0lkKTtcbiAgICAgICAgc2VsZi5fbXVsdGlwbGV4ZXIucmVtb3ZlZChvdmVyZmxvd2luZ0RvY0lkKTtcbiAgICAgICAgc2VsZi5fYWRkQnVmZmVyZWQob3ZlcmZsb3dpbmdEb2NJZCwgb3ZlcmZsb3dpbmdEb2MpO1xuICAgICAgfVxuICAgIH0pO1xuICB9LFxuICBfcmVtb3ZlUHVibGlzaGVkOiBmdW5jdGlvbiAoaWQpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5fcHVibGlzaGVkLnJlbW92ZShpZCk7XG4gICAgICBzZWxmLl9tdWx0aXBsZXhlci5yZW1vdmVkKGlkKTtcbiAgICAgIGlmICghIHNlbGYuX2xpbWl0IHx8IHNlbGYuX3B1Ymxpc2hlZC5zaXplKCkgPT09IHNlbGYuX2xpbWl0KVxuICAgICAgICByZXR1cm47XG5cbiAgICAgIGlmIChzZWxmLl9wdWJsaXNoZWQuc2l6ZSgpID4gc2VsZi5fbGltaXQpXG4gICAgICAgIHRocm93IEVycm9yKFwic2VsZi5fcHVibGlzaGVkIGdvdCB0b28gYmlnXCIpO1xuXG4gICAgICAvLyBPSywgd2UgYXJlIHB1Ymxpc2hpbmcgbGVzcyB0aGFuIHRoZSBsaW1pdC4gTWF5YmUgd2Ugc2hvdWxkIGxvb2sgaW4gdGhlXG4gICAgICAvLyBidWZmZXIgdG8gZmluZCB0aGUgbmV4dCBlbGVtZW50IHBhc3Qgd2hhdCB3ZSB3ZXJlIHB1Ymxpc2hpbmcgYmVmb3JlLlxuXG4gICAgICBpZiAoIXNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmVtcHR5KCkpIHtcbiAgICAgICAgLy8gVGhlcmUncyBzb21ldGhpbmcgaW4gdGhlIGJ1ZmZlcjsgbW92ZSB0aGUgZmlyc3QgdGhpbmcgaW4gaXQgdG9cbiAgICAgICAgLy8gX3B1Ymxpc2hlZC5cbiAgICAgICAgdmFyIG5ld0RvY0lkID0gc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIubWluRWxlbWVudElkKCk7XG4gICAgICAgIHZhciBuZXdEb2MgPSBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5nZXQobmV3RG9jSWQpO1xuICAgICAgICBzZWxmLl9yZW1vdmVCdWZmZXJlZChuZXdEb2NJZCk7XG4gICAgICAgIHNlbGYuX2FkZFB1Ymxpc2hlZChuZXdEb2NJZCwgbmV3RG9jKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBUaGVyZSdzIG5vdGhpbmcgaW4gdGhlIGJ1ZmZlci4gIFRoaXMgY291bGQgbWVhbiBvbmUgb2YgYSBmZXcgdGhpbmdzLlxuXG4gICAgICAvLyAoYSkgV2UgY291bGQgYmUgaW4gdGhlIG1pZGRsZSBvZiByZS1ydW5uaW5nIHRoZSBxdWVyeSAoc3BlY2lmaWNhbGx5LCB3ZVxuICAgICAgLy8gY291bGQgYmUgaW4gX3B1Ymxpc2hOZXdSZXN1bHRzKS4gSW4gdGhhdCBjYXNlLCBfdW5wdWJsaXNoZWRCdWZmZXIgaXNcbiAgICAgIC8vIGVtcHR5IGJlY2F1c2Ugd2UgY2xlYXIgaXQgYXQgdGhlIGJlZ2lubmluZyBvZiBfcHVibGlzaE5ld1Jlc3VsdHMuIEluXG4gICAgICAvLyB0aGlzIGNhc2UsIG91ciBjYWxsZXIgYWxyZWFkeSBrbm93cyB0aGUgZW50aXJlIGFuc3dlciB0byB0aGUgcXVlcnkgYW5kXG4gICAgICAvLyB3ZSBkb24ndCBuZWVkIHRvIGRvIGFueXRoaW5nIGZhbmN5IGhlcmUuICBKdXN0IHJldHVybi5cbiAgICAgIGlmIChzZWxmLl9waGFzZSA9PT0gUEhBU0UuUVVFUllJTkcpXG4gICAgICAgIHJldHVybjtcblxuICAgICAgLy8gKGIpIFdlJ3JlIHByZXR0eSBjb25maWRlbnQgdGhhdCB0aGUgdW5pb24gb2YgX3B1Ymxpc2hlZCBhbmRcbiAgICAgIC8vIF91bnB1Ymxpc2hlZEJ1ZmZlciBjb250YWluIGFsbCBkb2N1bWVudHMgdGhhdCBtYXRjaCBzZWxlY3Rvci4gQmVjYXVzZVxuICAgICAgLy8gX3VucHVibGlzaGVkQnVmZmVyIGlzIGVtcHR5LCB0aGF0IG1lYW5zIHdlJ3JlIGNvbmZpZGVudCB0aGF0IF9wdWJsaXNoZWRcbiAgICAgIC8vIGNvbnRhaW5zIGFsbCBkb2N1bWVudHMgdGhhdCBtYXRjaCBzZWxlY3Rvci4gU28gd2UgaGF2ZSBub3RoaW5nIHRvIGRvLlxuICAgICAgaWYgKHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlcilcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICAvLyAoYykgTWF5YmUgdGhlcmUgYXJlIG90aGVyIGRvY3VtZW50cyBvdXQgdGhlcmUgdGhhdCBzaG91bGQgYmUgaW4gb3VyXG4gICAgICAvLyBidWZmZXIuIEJ1dCBpbiB0aGF0IGNhc2UsIHdoZW4gd2UgZW1wdGllZCBfdW5wdWJsaXNoZWRCdWZmZXIgaW5cbiAgICAgIC8vIF9yZW1vdmVCdWZmZXJlZCwgd2Ugc2hvdWxkIGhhdmUgY2FsbGVkIF9uZWVkVG9Qb2xsUXVlcnksIHdoaWNoIHdpbGxcbiAgICAgIC8vIGVpdGhlciBwdXQgc29tZXRoaW5nIGluIF91bnB1Ymxpc2hlZEJ1ZmZlciBvciBzZXQgX3NhZmVBcHBlbmRUb0J1ZmZlclxuICAgICAgLy8gKG9yIGJvdGgpLCBhbmQgaXQgd2lsbCBwdXQgdXMgaW4gUVVFUllJTkcgZm9yIHRoYXQgd2hvbGUgdGltZS4gU28gaW5cbiAgICAgIC8vIGZhY3QsIHdlIHNob3VsZG4ndCBiZSBhYmxlIHRvIGdldCBoZXJlLlxuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJCdWZmZXIgaW5leHBsaWNhYmx5IGVtcHR5XCIpO1xuICAgIH0pO1xuICB9LFxuICBfY2hhbmdlUHVibGlzaGVkOiBmdW5jdGlvbiAoaWQsIG9sZERvYywgbmV3RG9jKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX3B1Ymxpc2hlZC5zZXQoaWQsIHNlbGYuX3NoYXJlZFByb2plY3Rpb25GbihuZXdEb2MpKTtcbiAgICAgIHZhciBwcm9qZWN0ZWROZXcgPSBzZWxmLl9wcm9qZWN0aW9uRm4obmV3RG9jKTtcbiAgICAgIHZhciBwcm9qZWN0ZWRPbGQgPSBzZWxmLl9wcm9qZWN0aW9uRm4ob2xkRG9jKTtcbiAgICAgIHZhciBjaGFuZ2VkID0gRGlmZlNlcXVlbmNlLm1ha2VDaGFuZ2VkRmllbGRzKFxuICAgICAgICBwcm9qZWN0ZWROZXcsIHByb2plY3RlZE9sZCk7XG4gICAgICBpZiAoIV8uaXNFbXB0eShjaGFuZ2VkKSlcbiAgICAgICAgc2VsZi5fbXVsdGlwbGV4ZXIuY2hhbmdlZChpZCwgY2hhbmdlZCk7XG4gICAgfSk7XG4gIH0sXG4gIF9hZGRCdWZmZXJlZDogZnVuY3Rpb24gKGlkLCBkb2MpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuc2V0KGlkLCBzZWxmLl9zaGFyZWRQcm9qZWN0aW9uRm4oZG9jKSk7XG5cbiAgICAgIC8vIElmIHNvbWV0aGluZyBpcyBvdmVyZmxvd2luZyB0aGUgYnVmZmVyLCB3ZSBqdXN0IHJlbW92ZSBpdCBmcm9tIGNhY2hlXG4gICAgICBpZiAoc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuc2l6ZSgpID4gc2VsZi5fbGltaXQpIHtcbiAgICAgICAgdmFyIG1heEJ1ZmZlcmVkSWQgPSBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5tYXhFbGVtZW50SWQoKTtcblxuICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5yZW1vdmUobWF4QnVmZmVyZWRJZCk7XG5cbiAgICAgICAgLy8gU2luY2Ugc29tZXRoaW5nIG1hdGNoaW5nIGlzIHJlbW92ZWQgZnJvbSBjYWNoZSAoYm90aCBwdWJsaXNoZWQgc2V0IGFuZFxuICAgICAgICAvLyBidWZmZXIpLCBzZXQgZmxhZyB0byBmYWxzZVxuICAgICAgICBzZWxmLl9zYWZlQXBwZW5kVG9CdWZmZXIgPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcbiAgLy8gSXMgY2FsbGVkIGVpdGhlciB0byByZW1vdmUgdGhlIGRvYyBjb21wbGV0ZWx5IGZyb20gbWF0Y2hpbmcgc2V0IG9yIHRvIG1vdmVcbiAgLy8gaXQgdG8gdGhlIHB1Ymxpc2hlZCBzZXQgbGF0ZXIuXG4gIF9yZW1vdmVCdWZmZXJlZDogZnVuY3Rpb24gKGlkKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLnJlbW92ZShpZCk7XG4gICAgICAvLyBUbyBrZWVwIHRoZSBjb250cmFjdCBcImJ1ZmZlciBpcyBuZXZlciBlbXB0eSBpbiBTVEVBRFkgcGhhc2UgdW5sZXNzIHRoZVxuICAgICAgLy8gZXZlcnl0aGluZyBtYXRjaGluZyBmaXRzIGludG8gcHVibGlzaGVkXCIgdHJ1ZSwgd2UgcG9sbCBldmVyeXRoaW5nIGFzXG4gICAgICAvLyBzb29uIGFzIHdlIHNlZSB0aGUgYnVmZmVyIGJlY29taW5nIGVtcHR5LlxuICAgICAgaWYgKCEgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuc2l6ZSgpICYmICEgc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyKVxuICAgICAgICBzZWxmLl9uZWVkVG9Qb2xsUXVlcnkoKTtcbiAgICB9KTtcbiAgfSxcbiAgLy8gQ2FsbGVkIHdoZW4gYSBkb2N1bWVudCBoYXMgam9pbmVkIHRoZSBcIk1hdGNoaW5nXCIgcmVzdWx0cyBzZXQuXG4gIC8vIFRha2VzIHJlc3BvbnNpYmlsaXR5IG9mIGtlZXBpbmcgX3VucHVibGlzaGVkQnVmZmVyIGluIHN5bmMgd2l0aCBfcHVibGlzaGVkXG4gIC8vIGFuZCB0aGUgZWZmZWN0IG9mIGxpbWl0IGVuZm9yY2VkLlxuICBfYWRkTWF0Y2hpbmc6IGZ1bmN0aW9uIChkb2MpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGlkID0gZG9jLl9pZDtcbiAgICAgIGlmIChzZWxmLl9wdWJsaXNoZWQuaGFzKGlkKSlcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJ0cmllZCB0byBhZGQgc29tZXRoaW5nIGFscmVhZHkgcHVibGlzaGVkIFwiICsgaWQpO1xuICAgICAgaWYgKHNlbGYuX2xpbWl0ICYmIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmhhcyhpZCkpXG4gICAgICAgIHRocm93IEVycm9yKFwidHJpZWQgdG8gYWRkIHNvbWV0aGluZyBhbHJlYWR5IGV4aXN0ZWQgaW4gYnVmZmVyIFwiICsgaWQpO1xuXG4gICAgICB2YXIgbGltaXQgPSBzZWxmLl9saW1pdDtcbiAgICAgIHZhciBjb21wYXJhdG9yID0gc2VsZi5fY29tcGFyYXRvcjtcbiAgICAgIHZhciBtYXhQdWJsaXNoZWQgPSAobGltaXQgJiYgc2VsZi5fcHVibGlzaGVkLnNpemUoKSA+IDApID9cbiAgICAgICAgc2VsZi5fcHVibGlzaGVkLmdldChzZWxmLl9wdWJsaXNoZWQubWF4RWxlbWVudElkKCkpIDogbnVsbDtcbiAgICAgIHZhciBtYXhCdWZmZXJlZCA9IChsaW1pdCAmJiBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgPiAwKVxuICAgICAgICA/IHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLmdldChzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5tYXhFbGVtZW50SWQoKSlcbiAgICAgICAgOiBudWxsO1xuICAgICAgLy8gVGhlIHF1ZXJ5IGlzIHVubGltaXRlZCBvciBkaWRuJ3QgcHVibGlzaCBlbm91Z2ggZG9jdW1lbnRzIHlldCBvciB0aGVcbiAgICAgIC8vIG5ldyBkb2N1bWVudCB3b3VsZCBmaXQgaW50byBwdWJsaXNoZWQgc2V0IHB1c2hpbmcgdGhlIG1heGltdW0gZWxlbWVudFxuICAgICAgLy8gb3V0LCB0aGVuIHdlIG5lZWQgdG8gcHVibGlzaCB0aGUgZG9jLlxuICAgICAgdmFyIHRvUHVibGlzaCA9ICEgbGltaXQgfHwgc2VsZi5fcHVibGlzaGVkLnNpemUoKSA8IGxpbWl0IHx8XG4gICAgICAgIGNvbXBhcmF0b3IoZG9jLCBtYXhQdWJsaXNoZWQpIDwgMDtcblxuICAgICAgLy8gT3RoZXJ3aXNlIHdlIG1pZ2h0IG5lZWQgdG8gYnVmZmVyIGl0IChvbmx5IGluIGNhc2Ugb2YgbGltaXRlZCBxdWVyeSkuXG4gICAgICAvLyBCdWZmZXJpbmcgaXMgYWxsb3dlZCBpZiB0aGUgYnVmZmVyIGlzIG5vdCBmaWxsZWQgdXAgeWV0IGFuZCBhbGxcbiAgICAgIC8vIG1hdGNoaW5nIGRvY3MgYXJlIGVpdGhlciBpbiB0aGUgcHVibGlzaGVkIHNldCBvciBpbiB0aGUgYnVmZmVyLlxuICAgICAgdmFyIGNhbkFwcGVuZFRvQnVmZmVyID0gIXRvUHVibGlzaCAmJiBzZWxmLl9zYWZlQXBwZW5kVG9CdWZmZXIgJiZcbiAgICAgICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuc2l6ZSgpIDwgbGltaXQ7XG5cbiAgICAgIC8vIE9yIGlmIGl0IGlzIHNtYWxsIGVub3VnaCB0byBiZSBzYWZlbHkgaW5zZXJ0ZWQgdG8gdGhlIG1pZGRsZSBvciB0aGVcbiAgICAgIC8vIGJlZ2lubmluZyBvZiB0aGUgYnVmZmVyLlxuICAgICAgdmFyIGNhbkluc2VydEludG9CdWZmZXIgPSAhdG9QdWJsaXNoICYmIG1heEJ1ZmZlcmVkICYmXG4gICAgICAgIGNvbXBhcmF0b3IoZG9jLCBtYXhCdWZmZXJlZCkgPD0gMDtcblxuICAgICAgdmFyIHRvQnVmZmVyID0gY2FuQXBwZW5kVG9CdWZmZXIgfHwgY2FuSW5zZXJ0SW50b0J1ZmZlcjtcblxuICAgICAgaWYgKHRvUHVibGlzaCkge1xuICAgICAgICBzZWxmLl9hZGRQdWJsaXNoZWQoaWQsIGRvYyk7XG4gICAgICB9IGVsc2UgaWYgKHRvQnVmZmVyKSB7XG4gICAgICAgIHNlbGYuX2FkZEJ1ZmZlcmVkKGlkLCBkb2MpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gZHJvcHBpbmcgaXQgYW5kIG5vdCBzYXZpbmcgdG8gdGhlIGNhY2hlXG4gICAgICAgIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9LFxuICAvLyBDYWxsZWQgd2hlbiBhIGRvY3VtZW50IGxlYXZlcyB0aGUgXCJNYXRjaGluZ1wiIHJlc3VsdHMgc2V0LlxuICAvLyBUYWtlcyByZXNwb25zaWJpbGl0eSBvZiBrZWVwaW5nIF91bnB1Ymxpc2hlZEJ1ZmZlciBpbiBzeW5jIHdpdGggX3B1Ymxpc2hlZFxuICAvLyBhbmQgdGhlIGVmZmVjdCBvZiBsaW1pdCBlbmZvcmNlZC5cbiAgX3JlbW92ZU1hdGNoaW5nOiBmdW5jdGlvbiAoaWQpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKCEgc2VsZi5fcHVibGlzaGVkLmhhcyhpZCkgJiYgISBzZWxmLl9saW1pdClcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJ0cmllZCB0byByZW1vdmUgc29tZXRoaW5nIG1hdGNoaW5nIGJ1dCBub3QgY2FjaGVkIFwiICsgaWQpO1xuXG4gICAgICBpZiAoc2VsZi5fcHVibGlzaGVkLmhhcyhpZCkpIHtcbiAgICAgICAgc2VsZi5fcmVtb3ZlUHVibGlzaGVkKGlkKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuaGFzKGlkKSkge1xuICAgICAgICBzZWxmLl9yZW1vdmVCdWZmZXJlZChpZCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG4gIF9oYW5kbGVEb2M6IGZ1bmN0aW9uIChpZCwgbmV3RG9jKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBtYXRjaGVzTm93ID0gbmV3RG9jICYmIHNlbGYuX21hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKG5ld0RvYykucmVzdWx0O1xuXG4gICAgICB2YXIgcHVibGlzaGVkQmVmb3JlID0gc2VsZi5fcHVibGlzaGVkLmhhcyhpZCk7XG4gICAgICB2YXIgYnVmZmVyZWRCZWZvcmUgPSBzZWxmLl9saW1pdCAmJiBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5oYXMoaWQpO1xuICAgICAgdmFyIGNhY2hlZEJlZm9yZSA9IHB1Ymxpc2hlZEJlZm9yZSB8fCBidWZmZXJlZEJlZm9yZTtcblxuICAgICAgaWYgKG1hdGNoZXNOb3cgJiYgIWNhY2hlZEJlZm9yZSkge1xuICAgICAgICBzZWxmLl9hZGRNYXRjaGluZyhuZXdEb2MpO1xuICAgICAgfSBlbHNlIGlmIChjYWNoZWRCZWZvcmUgJiYgIW1hdGNoZXNOb3cpIHtcbiAgICAgICAgc2VsZi5fcmVtb3ZlTWF0Y2hpbmcoaWQpO1xuICAgICAgfSBlbHNlIGlmIChjYWNoZWRCZWZvcmUgJiYgbWF0Y2hlc05vdykge1xuICAgICAgICB2YXIgb2xkRG9jID0gc2VsZi5fcHVibGlzaGVkLmdldChpZCk7XG4gICAgICAgIHZhciBjb21wYXJhdG9yID0gc2VsZi5fY29tcGFyYXRvcjtcbiAgICAgICAgdmFyIG1pbkJ1ZmZlcmVkID0gc2VsZi5fbGltaXQgJiYgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuc2l6ZSgpICYmXG4gICAgICAgICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuZ2V0KHNlbGYuX3VucHVibGlzaGVkQnVmZmVyLm1pbkVsZW1lbnRJZCgpKTtcbiAgICAgICAgdmFyIG1heEJ1ZmZlcmVkO1xuXG4gICAgICAgIGlmIChwdWJsaXNoZWRCZWZvcmUpIHtcbiAgICAgICAgICAvLyBVbmxpbWl0ZWQgY2FzZSB3aGVyZSB0aGUgZG9jdW1lbnQgc3RheXMgaW4gcHVibGlzaGVkIG9uY2UgaXRcbiAgICAgICAgICAvLyBtYXRjaGVzIG9yIHRoZSBjYXNlIHdoZW4gd2UgZG9uJ3QgaGF2ZSBlbm91Z2ggbWF0Y2hpbmcgZG9jcyB0b1xuICAgICAgICAgIC8vIHB1Ymxpc2ggb3IgdGhlIGNoYW5nZWQgYnV0IG1hdGNoaW5nIGRvYyB3aWxsIHN0YXkgaW4gcHVibGlzaGVkXG4gICAgICAgICAgLy8gYW55d2F5cy5cbiAgICAgICAgICAvL1xuICAgICAgICAgIC8vIFhYWDogV2UgcmVseSBvbiB0aGUgZW1wdGluZXNzIG9mIGJ1ZmZlci4gQmUgc3VyZSB0byBtYWludGFpbiB0aGVcbiAgICAgICAgICAvLyBmYWN0IHRoYXQgYnVmZmVyIGNhbid0IGJlIGVtcHR5IGlmIHRoZXJlIGFyZSBtYXRjaGluZyBkb2N1bWVudHMgbm90XG4gICAgICAgICAgLy8gcHVibGlzaGVkLiBOb3RhYmx5LCB3ZSBkb24ndCB3YW50IHRvIHNjaGVkdWxlIHJlcG9sbCBhbmQgY29udGludWVcbiAgICAgICAgICAvLyByZWx5aW5nIG9uIHRoaXMgcHJvcGVydHkuXG4gICAgICAgICAgdmFyIHN0YXlzSW5QdWJsaXNoZWQgPSAhIHNlbGYuX2xpbWl0IHx8XG4gICAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkgPT09IDAgfHxcbiAgICAgICAgICAgIGNvbXBhcmF0b3IobmV3RG9jLCBtaW5CdWZmZXJlZCkgPD0gMDtcblxuICAgICAgICAgIGlmIChzdGF5c0luUHVibGlzaGVkKSB7XG4gICAgICAgICAgICBzZWxmLl9jaGFuZ2VQdWJsaXNoZWQoaWQsIG9sZERvYywgbmV3RG9jKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gYWZ0ZXIgdGhlIGNoYW5nZSBkb2MgZG9lc24ndCBzdGF5IGluIHRoZSBwdWJsaXNoZWQsIHJlbW92ZSBpdFxuICAgICAgICAgICAgc2VsZi5fcmVtb3ZlUHVibGlzaGVkKGlkKTtcbiAgICAgICAgICAgIC8vIGJ1dCBpdCBjYW4gbW92ZSBpbnRvIGJ1ZmZlcmVkIG5vdywgY2hlY2sgaXRcbiAgICAgICAgICAgIG1heEJ1ZmZlcmVkID0gc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuZ2V0KFxuICAgICAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5tYXhFbGVtZW50SWQoKSk7XG5cbiAgICAgICAgICAgIHZhciB0b0J1ZmZlciA9IHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciB8fFxuICAgICAgICAgICAgICAgICAgKG1heEJ1ZmZlcmVkICYmIGNvbXBhcmF0b3IobmV3RG9jLCBtYXhCdWZmZXJlZCkgPD0gMCk7XG5cbiAgICAgICAgICAgIGlmICh0b0J1ZmZlcikge1xuICAgICAgICAgICAgICBzZWxmLl9hZGRCdWZmZXJlZChpZCwgbmV3RG9jKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFRocm93IGF3YXkgZnJvbSBib3RoIHB1Ymxpc2hlZCBzZXQgYW5kIGJ1ZmZlclxuICAgICAgICAgICAgICBzZWxmLl9zYWZlQXBwZW5kVG9CdWZmZXIgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoYnVmZmVyZWRCZWZvcmUpIHtcbiAgICAgICAgICBvbGREb2MgPSBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5nZXQoaWQpO1xuICAgICAgICAgIC8vIHJlbW92ZSB0aGUgb2xkIHZlcnNpb24gbWFudWFsbHkgaW5zdGVhZCBvZiB1c2luZyBfcmVtb3ZlQnVmZmVyZWQgc29cbiAgICAgICAgICAvLyB3ZSBkb24ndCB0cmlnZ2VyIHRoZSBxdWVyeWluZyBpbW1lZGlhdGVseS4gIGlmIHdlIGVuZCB0aGlzIGJsb2NrXG4gICAgICAgICAgLy8gd2l0aCB0aGUgYnVmZmVyIGVtcHR5LCB3ZSB3aWxsIG5lZWQgdG8gdHJpZ2dlciB0aGUgcXVlcnkgcG9sbFxuICAgICAgICAgIC8vIG1hbnVhbGx5IHRvby5cbiAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5yZW1vdmUoaWQpO1xuXG4gICAgICAgICAgdmFyIG1heFB1Ymxpc2hlZCA9IHNlbGYuX3B1Ymxpc2hlZC5nZXQoXG4gICAgICAgICAgICBzZWxmLl9wdWJsaXNoZWQubWF4RWxlbWVudElkKCkpO1xuICAgICAgICAgIG1heEJ1ZmZlcmVkID0gc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuc2l6ZSgpICYmXG4gICAgICAgICAgICAgICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuZ2V0KFxuICAgICAgICAgICAgICAgICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIubWF4RWxlbWVudElkKCkpO1xuXG4gICAgICAgICAgLy8gdGhlIGJ1ZmZlcmVkIGRvYyB3YXMgdXBkYXRlZCwgaXQgY291bGQgbW92ZSB0byBwdWJsaXNoZWRcbiAgICAgICAgICB2YXIgdG9QdWJsaXNoID0gY29tcGFyYXRvcihuZXdEb2MsIG1heFB1Ymxpc2hlZCkgPCAwO1xuXG4gICAgICAgICAgLy8gb3Igc3RheXMgaW4gYnVmZmVyIGV2ZW4gYWZ0ZXIgdGhlIGNoYW5nZVxuICAgICAgICAgIHZhciBzdGF5c0luQnVmZmVyID0gKCEgdG9QdWJsaXNoICYmIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlcikgfHxcbiAgICAgICAgICAgICAgICAoIXRvUHVibGlzaCAmJiBtYXhCdWZmZXJlZCAmJlxuICAgICAgICAgICAgICAgICBjb21wYXJhdG9yKG5ld0RvYywgbWF4QnVmZmVyZWQpIDw9IDApO1xuXG4gICAgICAgICAgaWYgKHRvUHVibGlzaCkge1xuICAgICAgICAgICAgc2VsZi5fYWRkUHVibGlzaGVkKGlkLCBuZXdEb2MpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoc3RheXNJbkJ1ZmZlcikge1xuICAgICAgICAgICAgLy8gc3RheXMgaW4gYnVmZmVyIGJ1dCBjaGFuZ2VzXG4gICAgICAgICAgICBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zZXQoaWQsIG5ld0RvYyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFRocm93IGF3YXkgZnJvbSBib3RoIHB1Ymxpc2hlZCBzZXQgYW5kIGJ1ZmZlclxuICAgICAgICAgICAgc2VsZi5fc2FmZUFwcGVuZFRvQnVmZmVyID0gZmFsc2U7XG4gICAgICAgICAgICAvLyBOb3JtYWxseSB0aGlzIGNoZWNrIHdvdWxkIGhhdmUgYmVlbiBkb25lIGluIF9yZW1vdmVCdWZmZXJlZCBidXRcbiAgICAgICAgICAgIC8vIHdlIGRpZG4ndCB1c2UgaXQsIHNvIHdlIG5lZWQgdG8gZG8gaXQgb3Vyc2VsZiBub3cuXG4gICAgICAgICAgICBpZiAoISBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5zaXplKCkpIHtcbiAgICAgICAgICAgICAgc2VsZi5fbmVlZFRvUG9sbFF1ZXJ5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImNhY2hlZEJlZm9yZSBpbXBsaWVzIGVpdGhlciBvZiBwdWJsaXNoZWRCZWZvcmUgb3IgYnVmZmVyZWRCZWZvcmUgaXMgdHJ1ZS5cIik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcbiAgX2ZldGNoTW9kaWZpZWREb2N1bWVudHM6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5fcmVnaXN0ZXJQaGFzZUNoYW5nZShQSEFTRS5GRVRDSElORyk7XG4gICAgICAvLyBEZWZlciwgYmVjYXVzZSBub3RoaW5nIGNhbGxlZCBmcm9tIHRoZSBvcGxvZyBlbnRyeSBoYW5kbGVyIG1heSB5aWVsZCxcbiAgICAgIC8vIGJ1dCBmZXRjaCgpIHlpZWxkcy5cbiAgICAgIE1ldGVvci5kZWZlcihmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeShmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdoaWxlICghc2VsZi5fc3RvcHBlZCAmJiAhc2VsZi5fbmVlZFRvRmV0Y2guZW1wdHkoKSkge1xuICAgICAgICAgIGlmIChzZWxmLl9waGFzZSA9PT0gUEhBU0UuUVVFUllJTkcpIHtcbiAgICAgICAgICAgIC8vIFdoaWxlIGZldGNoaW5nLCB3ZSBkZWNpZGVkIHRvIGdvIGludG8gUVVFUllJTkcgbW9kZSwgYW5kIHRoZW4gd2VcbiAgICAgICAgICAgIC8vIHNhdyBhbm90aGVyIG9wbG9nIGVudHJ5LCBzbyBfbmVlZFRvRmV0Y2ggaXMgbm90IGVtcHR5LiBCdXQgd2VcbiAgICAgICAgICAgIC8vIHNob3VsZG4ndCBmZXRjaCB0aGVzZSBkb2N1bWVudHMgdW50aWwgQUZURVIgdGhlIHF1ZXJ5IGlzIGRvbmUuXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBCZWluZyBpbiBzdGVhZHkgcGhhc2UgaGVyZSB3b3VsZCBiZSBzdXJwcmlzaW5nLlxuICAgICAgICAgIGlmIChzZWxmLl9waGFzZSAhPT0gUEhBU0UuRkVUQ0hJTkcpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJwaGFzZSBpbiBmZXRjaE1vZGlmaWVkRG9jdW1lbnRzOiBcIiArIHNlbGYuX3BoYXNlKTtcblxuICAgICAgICAgIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nID0gc2VsZi5fbmVlZFRvRmV0Y2g7XG4gICAgICAgICAgdmFyIHRoaXNHZW5lcmF0aW9uID0gKytzZWxmLl9mZXRjaEdlbmVyYXRpb247XG4gICAgICAgICAgc2VsZi5fbmVlZFRvRmV0Y2ggPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgICAgICAgICB2YXIgd2FpdGluZyA9IDA7XG4gICAgICAgICAgdmFyIGZ1dCA9IG5ldyBGdXR1cmU7XG4gICAgICAgICAgLy8gVGhpcyBsb29wIGlzIHNhZmUsIGJlY2F1c2UgX2N1cnJlbnRseUZldGNoaW5nIHdpbGwgbm90IGJlIHVwZGF0ZWRcbiAgICAgICAgICAvLyBkdXJpbmcgdGhpcyBsb29wIChpbiBmYWN0LCBpdCBpcyBuZXZlciBtdXRhdGVkKS5cbiAgICAgICAgICBzZWxmLl9jdXJyZW50bHlGZXRjaGluZy5mb3JFYWNoKGZ1bmN0aW9uIChvcCwgaWQpIHtcbiAgICAgICAgICAgIHdhaXRpbmcrKztcbiAgICAgICAgICAgIHNlbGYuX21vbmdvSGFuZGxlLl9kb2NGZXRjaGVyLmZldGNoKFxuICAgICAgICAgICAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5jb2xsZWN0aW9uTmFtZSwgaWQsIG9wLFxuICAgICAgICAgICAgICBmaW5pc2hJZk5lZWRUb1BvbGxRdWVyeShmdW5jdGlvbiAoZXJyLCBkb2MpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICBNZXRlb3IuX2RlYnVnKFwiR290IGV4Y2VwdGlvbiB3aGlsZSBmZXRjaGluZyBkb2N1bWVudHNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnIpO1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB3ZSBnZXQgYW4gZXJyb3IgZnJvbSB0aGUgZmV0Y2hlciAoZWcsIHRyb3VibGVcbiAgICAgICAgICAgICAgICAgICAgLy8gY29ubmVjdGluZyB0byBNb25nbyksIGxldCdzIGp1c3QgYWJhbmRvbiB0aGUgZmV0Y2ggcGhhc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gYWx0b2dldGhlciBhbmQgZmFsbCBiYWNrIHRvIHBvbGxpbmcuIEl0J3Mgbm90IGxpa2Ugd2UncmVcbiAgICAgICAgICAgICAgICAgICAgLy8gZ2V0dGluZyBsaXZlIHVwZGF0ZXMgYW55d2F5LlxuICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZi5fcGhhc2UgIT09IFBIQVNFLlFVRVJZSU5HKSB7XG4gICAgICAgICAgICAgICAgICAgICAgc2VsZi5fbmVlZFRvUG9sbFF1ZXJ5KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIXNlbGYuX3N0b3BwZWQgJiYgc2VsZi5fcGhhc2UgPT09IFBIQVNFLkZFVENISU5HXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHNlbGYuX2ZldGNoR2VuZXJhdGlvbiA9PT0gdGhpc0dlbmVyYXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gV2UgcmUtY2hlY2sgdGhlIGdlbmVyYXRpb24gaW4gY2FzZSB3ZSd2ZSBoYWQgYW4gZXhwbGljaXRcbiAgICAgICAgICAgICAgICAgICAgLy8gX3BvbGxRdWVyeSBjYWxsIChlZywgaW4gYW5vdGhlciBmaWJlcikgd2hpY2ggc2hvdWxkXG4gICAgICAgICAgICAgICAgICAgIC8vIGVmZmVjdGl2ZWx5IGNhbmNlbCB0aGlzIHJvdW5kIG9mIGZldGNoZXMuICAoX3BvbGxRdWVyeVxuICAgICAgICAgICAgICAgICAgICAvLyBpbmNyZW1lbnRzIHRoZSBnZW5lcmF0aW9uLilcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5faGFuZGxlRG9jKGlkLCBkb2MpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgICB3YWl0aW5nLS07XG4gICAgICAgICAgICAgICAgICAvLyBCZWNhdXNlIGZldGNoKCkgbmV2ZXIgY2FsbHMgaXRzIGNhbGxiYWNrIHN5bmNocm9ub3VzbHksXG4gICAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIHNhZmUgKGllLCB3ZSB3b24ndCBjYWxsIGZ1dC5yZXR1cm4oKSBiZWZvcmUgdGhlXG4gICAgICAgICAgICAgICAgICAvLyBmb3JFYWNoIGlzIGRvbmUpLlxuICAgICAgICAgICAgICAgICAgaWYgKHdhaXRpbmcgPT09IDApXG4gICAgICAgICAgICAgICAgICAgIGZ1dC5yZXR1cm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBmdXQud2FpdCgpO1xuICAgICAgICAgIC8vIEV4aXQgbm93IGlmIHdlJ3ZlIGhhZCBhIF9wb2xsUXVlcnkgY2FsbCAoaGVyZSBvciBpbiBhbm90aGVyIGZpYmVyKS5cbiAgICAgICAgICBpZiAoc2VsZi5fcGhhc2UgPT09IFBIQVNFLlFVRVJZSU5HKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSdyZSBkb25lIGZldGNoaW5nLCBzbyB3ZSBjYW4gYmUgc3RlYWR5LCB1bmxlc3Mgd2UndmUgaGFkIGFcbiAgICAgICAgLy8gX3BvbGxRdWVyeSBjYWxsIChoZXJlIG9yIGluIGFub3RoZXIgZmliZXIpLlxuICAgICAgICBpZiAoc2VsZi5fcGhhc2UgIT09IFBIQVNFLlFVRVJZSU5HKVxuICAgICAgICAgIHNlbGYuX2JlU3RlYWR5KCk7XG4gICAgICB9KSk7XG4gICAgfSk7XG4gIH0sXG4gIF9iZVN0ZWFkeTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9yZWdpc3RlclBoYXNlQ2hhbmdlKFBIQVNFLlNURUFEWSk7XG4gICAgICB2YXIgd3JpdGVzID0gc2VsZi5fd3JpdGVzVG9Db21taXRXaGVuV2VSZWFjaFN0ZWFkeTtcbiAgICAgIHNlbGYuX3dyaXRlc1RvQ29tbWl0V2hlbldlUmVhY2hTdGVhZHkgPSBbXTtcbiAgICAgIHNlbGYuX211bHRpcGxleGVyLm9uRmx1c2goZnVuY3Rpb24gKCkge1xuICAgICAgICBfLmVhY2god3JpdGVzLCBmdW5jdGlvbiAodykge1xuICAgICAgICAgIHcuY29tbWl0dGVkKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0sXG4gIF9oYW5kbGVPcGxvZ0VudHJ5UXVlcnlpbmc6IGZ1bmN0aW9uIChvcCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9uZWVkVG9GZXRjaC5zZXQoaWRGb3JPcChvcCksIG9wKTtcbiAgICB9KTtcbiAgfSxcbiAgX2hhbmRsZU9wbG9nRW50cnlTdGVhZHlPckZldGNoaW5nOiBmdW5jdGlvbiAob3ApIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGlkID0gaWRGb3JPcChvcCk7XG4gICAgICAvLyBJZiB3ZSdyZSBhbHJlYWR5IGZldGNoaW5nIHRoaXMgb25lLCBvciBhYm91dCB0bywgd2UgY2FuJ3Qgb3B0aW1pemU7XG4gICAgICAvLyBtYWtlIHN1cmUgdGhhdCB3ZSBmZXRjaCBpdCBhZ2FpbiBpZiBuZWNlc3NhcnkuXG4gICAgICBpZiAoc2VsZi5fcGhhc2UgPT09IFBIQVNFLkZFVENISU5HICYmXG4gICAgICAgICAgKChzZWxmLl9jdXJyZW50bHlGZXRjaGluZyAmJiBzZWxmLl9jdXJyZW50bHlGZXRjaGluZy5oYXMoaWQpKSB8fFxuICAgICAgICAgICBzZWxmLl9uZWVkVG9GZXRjaC5oYXMoaWQpKSkge1xuICAgICAgICBzZWxmLl9uZWVkVG9GZXRjaC5zZXQoaWQsIG9wKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAob3Aub3AgPT09ICdkJykge1xuICAgICAgICBpZiAoc2VsZi5fcHVibGlzaGVkLmhhcyhpZCkgfHxcbiAgICAgICAgICAgIChzZWxmLl9saW1pdCAmJiBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5oYXMoaWQpKSlcbiAgICAgICAgICBzZWxmLl9yZW1vdmVNYXRjaGluZyhpZCk7XG4gICAgICB9IGVsc2UgaWYgKG9wLm9wID09PSAnaScpIHtcbiAgICAgICAgaWYgKHNlbGYuX3B1Ymxpc2hlZC5oYXMoaWQpKVxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImluc2VydCBmb3VuZCBmb3IgYWxyZWFkeS1leGlzdGluZyBJRCBpbiBwdWJsaXNoZWRcIik7XG4gICAgICAgIGlmIChzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlciAmJiBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5oYXMoaWQpKVxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImluc2VydCBmb3VuZCBmb3IgYWxyZWFkeS1leGlzdGluZyBJRCBpbiBidWZmZXJcIik7XG5cbiAgICAgICAgLy8gWFhYIHdoYXQgaWYgc2VsZWN0b3IgeWllbGRzPyAgZm9yIG5vdyBpdCBjYW4ndCBidXQgbGF0ZXIgaXQgY291bGRcbiAgICAgICAgLy8gaGF2ZSAkd2hlcmVcbiAgICAgICAgaWYgKHNlbGYuX21hdGNoZXIuZG9jdW1lbnRNYXRjaGVzKG9wLm8pLnJlc3VsdClcbiAgICAgICAgICBzZWxmLl9hZGRNYXRjaGluZyhvcC5vKTtcbiAgICAgIH0gZWxzZSBpZiAob3Aub3AgPT09ICd1Jykge1xuICAgICAgICAvLyB3ZSBhcmUgbWFwcGluZyB0aGUgbmV3IG9wbG9nIGZvcm1hdCBvbiBtb25nbyA1XG4gICAgICAgIC8vIHRvIHdoYXQgd2Uga25vdyBiZXR0ZXIsICRzZXRcbiAgICAgICAgb3AubyA9IG9wbG9nVjJWMUNvbnZlcnRlcihvcC5vKVxuICAgICAgICAvLyBJcyB0aGlzIGEgbW9kaWZpZXIgKCRzZXQvJHVuc2V0LCB3aGljaCBtYXkgcmVxdWlyZSB1cyB0byBwb2xsIHRoZVxuICAgICAgICAvLyBkYXRhYmFzZSB0byBmaWd1cmUgb3V0IGlmIHRoZSB3aG9sZSBkb2N1bWVudCBtYXRjaGVzIHRoZSBzZWxlY3Rvcikgb3JcbiAgICAgICAgLy8gYSByZXBsYWNlbWVudCAoaW4gd2hpY2ggY2FzZSB3ZSBjYW4ganVzdCBkaXJlY3RseSByZS1ldmFsdWF0ZSB0aGVcbiAgICAgICAgLy8gc2VsZWN0b3IpP1xuICAgICAgICAvLyBvcGxvZyBmb3JtYXQgaGFzIGNoYW5nZWQgb24gbW9uZ29kYiA1LCB3ZSBoYXZlIHRvIHN1cHBvcnQgYm90aCBub3dcbiAgICAgICAgLy8gZGlmZiBpcyB0aGUgZm9ybWF0IGluIE1vbmdvIDUrIChvcGxvZyB2MilcbiAgICAgICAgdmFyIGlzUmVwbGFjZSA9ICFfLmhhcyhvcC5vLCAnJHNldCcpICYmICFfLmhhcyhvcC5vLCAnZGlmZicpICYmICFfLmhhcyhvcC5vLCAnJHVuc2V0Jyk7XG4gICAgICAgIC8vIElmIHRoaXMgbW9kaWZpZXIgbW9kaWZpZXMgc29tZXRoaW5nIGluc2lkZSBhbiBFSlNPTiBjdXN0b20gdHlwZSAoaWUsXG4gICAgICAgIC8vIGFueXRoaW5nIHdpdGggRUpTT04kKSwgdGhlbiB3ZSBjYW4ndCB0cnkgdG8gdXNlXG4gICAgICAgIC8vIExvY2FsQ29sbGVjdGlvbi5fbW9kaWZ5LCBzaW5jZSB0aGF0IGp1c3QgbXV0YXRlcyB0aGUgRUpTT04gZW5jb2RpbmcsXG4gICAgICAgIC8vIG5vdCB0aGUgYWN0dWFsIG9iamVjdC5cbiAgICAgICAgdmFyIGNhbkRpcmVjdGx5TW9kaWZ5RG9jID1cbiAgICAgICAgICAhaXNSZXBsYWNlICYmIG1vZGlmaWVyQ2FuQmVEaXJlY3RseUFwcGxpZWQob3Aubyk7XG5cbiAgICAgICAgdmFyIHB1Ymxpc2hlZEJlZm9yZSA9IHNlbGYuX3B1Ymxpc2hlZC5oYXMoaWQpO1xuICAgICAgICB2YXIgYnVmZmVyZWRCZWZvcmUgPSBzZWxmLl9saW1pdCAmJiBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5oYXMoaWQpO1xuXG4gICAgICAgIGlmIChpc1JlcGxhY2UpIHtcbiAgICAgICAgICBzZWxmLl9oYW5kbGVEb2MoaWQsIF8uZXh0ZW5kKHtfaWQ6IGlkfSwgb3AubykpO1xuICAgICAgICB9IGVsc2UgaWYgKChwdWJsaXNoZWRCZWZvcmUgfHwgYnVmZmVyZWRCZWZvcmUpICYmXG4gICAgICAgICAgICAgICAgICAgY2FuRGlyZWN0bHlNb2RpZnlEb2MpIHtcbiAgICAgICAgICAvLyBPaCBncmVhdCwgd2UgYWN0dWFsbHkga25vdyB3aGF0IHRoZSBkb2N1bWVudCBpcywgc28gd2UgY2FuIGFwcGx5XG4gICAgICAgICAgLy8gdGhpcyBkaXJlY3RseS5cbiAgICAgICAgICB2YXIgbmV3RG9jID0gc2VsZi5fcHVibGlzaGVkLmhhcyhpZClcbiAgICAgICAgICAgID8gc2VsZi5fcHVibGlzaGVkLmdldChpZCkgOiBzZWxmLl91bnB1Ymxpc2hlZEJ1ZmZlci5nZXQoaWQpO1xuICAgICAgICAgIG5ld0RvYyA9IEVKU09OLmNsb25lKG5ld0RvYyk7XG5cbiAgICAgICAgICBuZXdEb2MuX2lkID0gaWQ7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIExvY2FsQ29sbGVjdGlvbi5fbW9kaWZ5KG5ld0RvYywgb3Aubyk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgaWYgKGUubmFtZSAhPT0gXCJNaW5pbW9uZ29FcnJvclwiKVxuICAgICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgICAgLy8gV2UgZGlkbid0IHVuZGVyc3RhbmQgdGhlIG1vZGlmaWVyLiAgUmUtZmV0Y2guXG4gICAgICAgICAgICBzZWxmLl9uZWVkVG9GZXRjaC5zZXQoaWQsIG9wKTtcbiAgICAgICAgICAgIGlmIChzZWxmLl9waGFzZSA9PT0gUEhBU0UuU1RFQURZKSB7XG4gICAgICAgICAgICAgIHNlbGYuX2ZldGNoTW9kaWZpZWREb2N1bWVudHMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgc2VsZi5faGFuZGxlRG9jKGlkLCBzZWxmLl9zaGFyZWRQcm9qZWN0aW9uRm4obmV3RG9jKSk7XG4gICAgICAgIH0gZWxzZSBpZiAoIWNhbkRpcmVjdGx5TW9kaWZ5RG9jIHx8XG4gICAgICAgICAgICAgICAgICAgc2VsZi5fbWF0Y2hlci5jYW5CZWNvbWVUcnVlQnlNb2RpZmllcihvcC5vKSB8fFxuICAgICAgICAgICAgICAgICAgIChzZWxmLl9zb3J0ZXIgJiYgc2VsZi5fc29ydGVyLmFmZmVjdGVkQnlNb2RpZmllcihvcC5vKSkpIHtcbiAgICAgICAgICBzZWxmLl9uZWVkVG9GZXRjaC5zZXQoaWQsIG9wKTtcbiAgICAgICAgICBpZiAoc2VsZi5fcGhhc2UgPT09IFBIQVNFLlNURUFEWSlcbiAgICAgICAgICAgIHNlbGYuX2ZldGNoTW9kaWZpZWREb2N1bWVudHMoKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJYWFggU1VSUFJJU0lORyBPUEVSQVRJT046IFwiICsgb3ApO1xuICAgICAgfVxuICAgIH0pO1xuICB9LFxuICAvLyBZaWVsZHMhXG4gIF9ydW5Jbml0aWFsUXVlcnk6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcGxvZyBzdG9wcGVkIHN1cnByaXNpbmdseSBlYXJseVwiKTtcblxuICAgIHNlbGYuX3J1blF1ZXJ5KHtpbml0aWFsOiB0cnVlfSk7ICAvLyB5aWVsZHNcblxuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgcmV0dXJuOyAgLy8gY2FuIGhhcHBlbiBvbiBxdWVyeUVycm9yXG5cbiAgICAvLyBBbGxvdyBvYnNlcnZlQ2hhbmdlcyBjYWxscyB0byByZXR1cm4uIChBZnRlciB0aGlzLCBpdCdzIHBvc3NpYmxlIGZvclxuICAgIC8vIHN0b3AoKSB0byBiZSBjYWxsZWQuKVxuICAgIHNlbGYuX211bHRpcGxleGVyLnJlYWR5KCk7XG5cbiAgICBzZWxmLl9kb25lUXVlcnlpbmcoKTsgIC8vIHlpZWxkc1xuICB9LFxuXG4gIC8vIEluIHZhcmlvdXMgY2lyY3Vtc3RhbmNlcywgd2UgbWF5IGp1c3Qgd2FudCB0byBzdG9wIHByb2Nlc3NpbmcgdGhlIG9wbG9nIGFuZFxuICAvLyByZS1ydW4gdGhlIGluaXRpYWwgcXVlcnksIGp1c3QgYXMgaWYgd2Ugd2VyZSBhIFBvbGxpbmdPYnNlcnZlRHJpdmVyLlxuICAvL1xuICAvLyBUaGlzIGZ1bmN0aW9uIG1heSBub3QgYmxvY2ssIGJlY2F1c2UgaXQgaXMgY2FsbGVkIGZyb20gYW4gb3Bsb2cgZW50cnlcbiAgLy8gaGFuZGxlci5cbiAgLy9cbiAgLy8gWFhYIFdlIHNob3VsZCBjYWxsIHRoaXMgd2hlbiB3ZSBkZXRlY3QgdGhhdCB3ZSd2ZSBiZWVuIGluIEZFVENISU5HIGZvciBcInRvb1xuICAvLyBsb25nXCIuXG4gIC8vXG4gIC8vIFhYWCBXZSBzaG91bGQgY2FsbCB0aGlzIHdoZW4gd2UgZGV0ZWN0IE1vbmdvIGZhaWxvdmVyIChzaW5jZSB0aGF0IG1pZ2h0XG4gIC8vIG1lYW4gdGhhdCBzb21lIG9mIHRoZSBvcGxvZyBlbnRyaWVzIHdlIGhhdmUgcHJvY2Vzc2VkIGhhdmUgYmVlbiByb2xsZWRcbiAgLy8gYmFjaykuIFRoZSBOb2RlIE1vbmdvIGRyaXZlciBpcyBpbiB0aGUgbWlkZGxlIG9mIGEgYnVuY2ggb2YgaHVnZVxuICAvLyByZWZhY3RvcmluZ3MsIGluY2x1ZGluZyB0aGUgd2F5IHRoYXQgaXQgbm90aWZpZXMgeW91IHdoZW4gcHJpbWFyeVxuICAvLyBjaGFuZ2VzLiBXaWxsIHB1dCBvZmYgaW1wbGVtZW50aW5nIHRoaXMgdW50aWwgZHJpdmVyIDEuNCBpcyBvdXQuXG4gIF9wb2xsUXVlcnk6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICAgIHJldHVybjtcblxuICAgICAgLy8gWWF5LCB3ZSBnZXQgdG8gZm9yZ2V0IGFib3V0IGFsbCB0aGUgdGhpbmdzIHdlIHRob3VnaHQgd2UgaGFkIHRvIGZldGNoLlxuICAgICAgc2VsZi5fbmVlZFRvRmV0Y2ggPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgICAgIHNlbGYuX2N1cnJlbnRseUZldGNoaW5nID0gbnVsbDtcbiAgICAgICsrc2VsZi5fZmV0Y2hHZW5lcmF0aW9uOyAgLy8gaWdub3JlIGFueSBpbi1mbGlnaHQgZmV0Y2hlc1xuICAgICAgc2VsZi5fcmVnaXN0ZXJQaGFzZUNoYW5nZShQSEFTRS5RVUVSWUlORyk7XG5cbiAgICAgIC8vIERlZmVyIHNvIHRoYXQgd2UgZG9uJ3QgeWllbGQuICBXZSBkb24ndCBuZWVkIGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5XG4gICAgICAvLyBoZXJlIGJlY2F1c2UgU3dpdGNoZWRUb1F1ZXJ5IGlzIG5vdCB0aHJvd24gaW4gUVVFUllJTkcgbW9kZS5cbiAgICAgIE1ldGVvci5kZWZlcihmdW5jdGlvbiAoKSB7XG4gICAgICAgIHNlbGYuX3J1blF1ZXJ5KCk7XG4gICAgICAgIHNlbGYuX2RvbmVRdWVyeWluZygpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0sXG5cbiAgLy8gWWllbGRzIVxuICBfcnVuUXVlcnk6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBuZXdSZXN1bHRzLCBuZXdCdWZmZXI7XG5cbiAgICAvLyBUaGlzIHdoaWxlIGxvb3AgaXMganVzdCB0byByZXRyeSBmYWlsdXJlcy5cbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgLy8gSWYgd2UndmUgYmVlbiBzdG9wcGVkLCB3ZSBkb24ndCBoYXZlIHRvIHJ1biBhbnl0aGluZyBhbnkgbW9yZS5cbiAgICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgICByZXR1cm47XG5cbiAgICAgIG5ld1Jlc3VsdHMgPSBuZXcgTG9jYWxDb2xsZWN0aW9uLl9JZE1hcDtcbiAgICAgIG5ld0J1ZmZlciA9IG5ldyBMb2NhbENvbGxlY3Rpb24uX0lkTWFwO1xuXG4gICAgICAvLyBRdWVyeSAyeCBkb2N1bWVudHMgYXMgdGhlIGhhbGYgZXhjbHVkZWQgZnJvbSB0aGUgb3JpZ2luYWwgcXVlcnkgd2lsbCBnb1xuICAgICAgLy8gaW50byB1bnB1Ymxpc2hlZCBidWZmZXIgdG8gcmVkdWNlIGFkZGl0aW9uYWwgTW9uZ28gbG9va3VwcyBpbiBjYXNlc1xuICAgICAgLy8gd2hlbiBkb2N1bWVudHMgYXJlIHJlbW92ZWQgZnJvbSB0aGUgcHVibGlzaGVkIHNldCBhbmQgbmVlZCBhXG4gICAgICAvLyByZXBsYWNlbWVudC5cbiAgICAgIC8vIFhYWCBuZWVkcyBtb3JlIHRob3VnaHQgb24gbm9uLXplcm8gc2tpcFxuICAgICAgLy8gWFhYIDIgaXMgYSBcIm1hZ2ljIG51bWJlclwiIG1lYW5pbmcgdGhlcmUgaXMgYW4gZXh0cmEgY2h1bmsgb2YgZG9jcyBmb3JcbiAgICAgIC8vIGJ1ZmZlciBpZiBzdWNoIGlzIG5lZWRlZC5cbiAgICAgIHZhciBjdXJzb3IgPSBzZWxmLl9jdXJzb3JGb3JRdWVyeSh7IGxpbWl0OiBzZWxmLl9saW1pdCAqIDIgfSk7XG4gICAgICB0cnkge1xuICAgICAgICBjdXJzb3IuZm9yRWFjaChmdW5jdGlvbiAoZG9jLCBpKSB7ICAvLyB5aWVsZHNcbiAgICAgICAgICBpZiAoIXNlbGYuX2xpbWl0IHx8IGkgPCBzZWxmLl9saW1pdCkge1xuICAgICAgICAgICAgbmV3UmVzdWx0cy5zZXQoZG9jLl9pZCwgZG9jKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmV3QnVmZmVyLnNldChkb2MuX2lkLCBkb2MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAob3B0aW9ucy5pbml0aWFsICYmIHR5cGVvZihlLmNvZGUpID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIC8vIFRoaXMgaXMgYW4gZXJyb3IgZG9jdW1lbnQgc2VudCB0byB1cyBieSBtb25nb2QsIG5vdCBhIGNvbm5lY3Rpb25cbiAgICAgICAgICAvLyBlcnJvciBnZW5lcmF0ZWQgYnkgdGhlIGNsaWVudC4gQW5kIHdlJ3ZlIG5ldmVyIHNlZW4gdGhpcyBxdWVyeSB3b3JrXG4gICAgICAgICAgLy8gc3VjY2Vzc2Z1bGx5LiBQcm9iYWJseSBpdCdzIGEgYmFkIHNlbGVjdG9yIG9yIHNvbWV0aGluZywgc28gd2VcbiAgICAgICAgICAvLyBzaG91bGQgTk9UIHJldHJ5LiBJbnN0ZWFkLCB3ZSBzaG91bGQgaGFsdCB0aGUgb2JzZXJ2ZSAod2hpY2ggZW5kc1xuICAgICAgICAgIC8vIHVwIGNhbGxpbmcgYHN0b3BgIG9uIHVzKS5cbiAgICAgICAgICBzZWxmLl9tdWx0aXBsZXhlci5xdWVyeUVycm9yKGUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIER1cmluZyBmYWlsb3ZlciAoZWcpIGlmIHdlIGdldCBhbiBleGNlcHRpb24gd2Ugc2hvdWxkIGxvZyBhbmQgcmV0cnlcbiAgICAgICAgLy8gaW5zdGVhZCBvZiBjcmFzaGluZy5cbiAgICAgICAgTWV0ZW9yLl9kZWJ1ZyhcIkdvdCBleGNlcHRpb24gd2hpbGUgcG9sbGluZyBxdWVyeVwiLCBlKTtcbiAgICAgICAgTWV0ZW9yLl9zbGVlcEZvck1zKDEwMCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNlbGYuX3N0b3BwZWQpXG4gICAgICByZXR1cm47XG5cbiAgICBzZWxmLl9wdWJsaXNoTmV3UmVzdWx0cyhuZXdSZXN1bHRzLCBuZXdCdWZmZXIpO1xuICB9LFxuXG4gIC8vIFRyYW5zaXRpb25zIHRvIFFVRVJZSU5HIGFuZCBydW5zIGFub3RoZXIgcXVlcnksIG9yIChpZiBhbHJlYWR5IGluIFFVRVJZSU5HKVxuICAvLyBlbnN1cmVzIHRoYXQgd2Ugd2lsbCBxdWVyeSBhZ2FpbiBsYXRlci5cbiAgLy9cbiAgLy8gVGhpcyBmdW5jdGlvbiBtYXkgbm90IGJsb2NrLCBiZWNhdXNlIGl0IGlzIGNhbGxlZCBmcm9tIGFuIG9wbG9nIGVudHJ5XG4gIC8vIGhhbmRsZXIuIEhvd2V2ZXIsIGlmIHdlIHdlcmUgbm90IGFscmVhZHkgaW4gdGhlIFFVRVJZSU5HIHBoYXNlLCBpdCB0aHJvd3NcbiAgLy8gYW4gZXhjZXB0aW9uIHRoYXQgaXMgY2F1Z2h0IGJ5IHRoZSBjbG9zZXN0IHN1cnJvdW5kaW5nXG4gIC8vIGZpbmlzaElmTmVlZFRvUG9sbFF1ZXJ5IGNhbGw7IHRoaXMgZW5zdXJlcyB0aGF0IHdlIGRvbid0IGNvbnRpbnVlIHJ1bm5pbmdcbiAgLy8gY2xvc2UgdGhhdCB3YXMgZGVzaWduZWQgZm9yIGFub3RoZXIgcGhhc2UgaW5zaWRlIFBIQVNFLlFVRVJZSU5HLlxuICAvL1xuICAvLyAoSXQncyBhbHNvIG5lY2Vzc2FyeSB3aGVuZXZlciBsb2dpYyBpbiB0aGlzIGZpbGUgeWllbGRzIHRvIGNoZWNrIHRoYXQgb3RoZXJcbiAgLy8gcGhhc2VzIGhhdmVuJ3QgcHV0IHVzIGludG8gUVVFUllJTkcgbW9kZSwgdGhvdWdoOyBlZyxcbiAgLy8gX2ZldGNoTW9kaWZpZWREb2N1bWVudHMgZG9lcyB0aGlzLilcbiAgX25lZWRUb1BvbGxRdWVyeTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICAvLyBJZiB3ZSdyZSBub3QgYWxyZWFkeSBpbiB0aGUgbWlkZGxlIG9mIGEgcXVlcnksIHdlIGNhbiBxdWVyeSBub3dcbiAgICAgIC8vIChwb3NzaWJseSBwYXVzaW5nIEZFVENISU5HKS5cbiAgICAgIGlmIChzZWxmLl9waGFzZSAhPT0gUEhBU0UuUVVFUllJTkcpIHtcbiAgICAgICAgc2VsZi5fcG9sbFF1ZXJ5KCk7XG4gICAgICAgIHRocm93IG5ldyBTd2l0Y2hlZFRvUXVlcnk7XG4gICAgICB9XG5cbiAgICAgIC8vIFdlJ3JlIGN1cnJlbnRseSBpbiBRVUVSWUlORy4gU2V0IGEgZmxhZyB0byBlbnN1cmUgdGhhdCB3ZSBydW4gYW5vdGhlclxuICAgICAgLy8gcXVlcnkgd2hlbiB3ZSdyZSBkb25lLlxuICAgICAgc2VsZi5fcmVxdWVyeVdoZW5Eb25lVGhpc1F1ZXJ5ID0gdHJ1ZTtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBZaWVsZHMhXG4gIF9kb25lUXVlcnlpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBpZiAoc2VsZi5fc3RvcHBlZClcbiAgICAgIHJldHVybjtcbiAgICBzZWxmLl9tb25nb0hhbmRsZS5fb3Bsb2dIYW5kbGUud2FpdFVudGlsQ2F1Z2h0VXAoKTsgIC8vIHlpZWxkc1xuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgcmV0dXJuO1xuICAgIGlmIChzZWxmLl9waGFzZSAhPT0gUEhBU0UuUVVFUllJTkcpXG4gICAgICB0aHJvdyBFcnJvcihcIlBoYXNlIHVuZXhwZWN0ZWRseSBcIiArIHNlbGYuX3BoYXNlKTtcblxuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChzZWxmLl9yZXF1ZXJ5V2hlbkRvbmVUaGlzUXVlcnkpIHtcbiAgICAgICAgc2VsZi5fcmVxdWVyeVdoZW5Eb25lVGhpc1F1ZXJ5ID0gZmFsc2U7XG4gICAgICAgIHNlbGYuX3BvbGxRdWVyeSgpO1xuICAgICAgfSBlbHNlIGlmIChzZWxmLl9uZWVkVG9GZXRjaC5lbXB0eSgpKSB7XG4gICAgICAgIHNlbGYuX2JlU3RlYWR5KCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLl9mZXRjaE1vZGlmaWVkRG9jdW1lbnRzKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgX2N1cnNvckZvclF1ZXJ5OiBmdW5jdGlvbiAob3B0aW9uc092ZXJ3cml0ZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgLy8gVGhlIHF1ZXJ5IHdlIHJ1biBpcyBhbG1vc3QgdGhlIHNhbWUgYXMgdGhlIGN1cnNvciB3ZSBhcmUgb2JzZXJ2aW5nLFxuICAgICAgLy8gd2l0aCBhIGZldyBjaGFuZ2VzLiBXZSBuZWVkIHRvIHJlYWQgYWxsIHRoZSBmaWVsZHMgdGhhdCBhcmUgcmVsZXZhbnQgdG9cbiAgICAgIC8vIHRoZSBzZWxlY3Rvciwgbm90IGp1c3QgdGhlIGZpZWxkcyB3ZSBhcmUgZ29pbmcgdG8gcHVibGlzaCAodGhhdCdzIHRoZVxuICAgICAgLy8gXCJzaGFyZWRcIiBwcm9qZWN0aW9uKS4gQW5kIHdlIGRvbid0IHdhbnQgdG8gYXBwbHkgYW55IHRyYW5zZm9ybSBpbiB0aGVcbiAgICAgIC8vIGN1cnNvciwgYmVjYXVzZSBvYnNlcnZlQ2hhbmdlcyBzaG91bGRuJ3QgdXNlIHRoZSB0cmFuc2Zvcm0uXG4gICAgICB2YXIgb3B0aW9ucyA9IF8uY2xvbmUoc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24ub3B0aW9ucyk7XG5cbiAgICAgIC8vIEFsbG93IHRoZSBjYWxsZXIgdG8gbW9kaWZ5IHRoZSBvcHRpb25zLiBVc2VmdWwgdG8gc3BlY2lmeSBkaWZmZXJlbnRcbiAgICAgIC8vIHNraXAgYW5kIGxpbWl0IHZhbHVlcy5cbiAgICAgIF8uZXh0ZW5kKG9wdGlvbnMsIG9wdGlvbnNPdmVyd3JpdGUpO1xuXG4gICAgICBvcHRpb25zLmZpZWxkcyA9IHNlbGYuX3NoYXJlZFByb2plY3Rpb247XG4gICAgICBkZWxldGUgb3B0aW9ucy50cmFuc2Zvcm07XG4gICAgICAvLyBXZSBhcmUgTk9UIGRlZXAgY2xvbmluZyBmaWVsZHMgb3Igc2VsZWN0b3IgaGVyZSwgd2hpY2ggc2hvdWxkIGJlIE9LLlxuICAgICAgdmFyIGRlc2NyaXB0aW9uID0gbmV3IEN1cnNvckRlc2NyaXB0aW9uKFxuICAgICAgICBzZWxmLl9jdXJzb3JEZXNjcmlwdGlvbi5jb2xsZWN0aW9uTmFtZSxcbiAgICAgICAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24uc2VsZWN0b3IsXG4gICAgICAgIG9wdGlvbnMpO1xuICAgICAgcmV0dXJuIG5ldyBDdXJzb3Ioc2VsZi5fbW9uZ29IYW5kbGUsIGRlc2NyaXB0aW9uKTtcbiAgICB9KTtcbiAgfSxcblxuXG4gIC8vIFJlcGxhY2Ugc2VsZi5fcHVibGlzaGVkIHdpdGggbmV3UmVzdWx0cyAoYm90aCBhcmUgSWRNYXBzKSwgaW52b2tpbmcgb2JzZXJ2ZVxuICAvLyBjYWxsYmFja3Mgb24gdGhlIG11bHRpcGxleGVyLlxuICAvLyBSZXBsYWNlIHNlbGYuX3VucHVibGlzaGVkQnVmZmVyIHdpdGggbmV3QnVmZmVyLlxuICAvL1xuICAvLyBYWFggVGhpcyBpcyB2ZXJ5IHNpbWlsYXIgdG8gTG9jYWxDb2xsZWN0aW9uLl9kaWZmUXVlcnlVbm9yZGVyZWRDaGFuZ2VzLiBXZVxuICAvLyBzaG91bGQgcmVhbGx5OiAoYSkgVW5pZnkgSWRNYXAgYW5kIE9yZGVyZWREaWN0IGludG8gVW5vcmRlcmVkL09yZGVyZWREaWN0XG4gIC8vIChiKSBSZXdyaXRlIGRpZmYuanMgdG8gdXNlIHRoZXNlIGNsYXNzZXMgaW5zdGVhZCBvZiBhcnJheXMgYW5kIG9iamVjdHMuXG4gIF9wdWJsaXNoTmV3UmVzdWx0czogZnVuY3Rpb24gKG5ld1Jlc3VsdHMsIG5ld0J1ZmZlcikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG5cbiAgICAgIC8vIElmIHRoZSBxdWVyeSBpcyBsaW1pdGVkIGFuZCB0aGVyZSBpcyBhIGJ1ZmZlciwgc2h1dCBkb3duIHNvIGl0IGRvZXNuJ3RcbiAgICAgIC8vIHN0YXkgaW4gYSB3YXkuXG4gICAgICBpZiAoc2VsZi5fbGltaXQpIHtcbiAgICAgICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIuY2xlYXIoKTtcbiAgICAgIH1cblxuICAgICAgLy8gRmlyc3QgcmVtb3ZlIGFueXRoaW5nIHRoYXQncyBnb25lLiBCZSBjYXJlZnVsIG5vdCB0byBtb2RpZnlcbiAgICAgIC8vIHNlbGYuX3B1Ymxpc2hlZCB3aGlsZSBpdGVyYXRpbmcgb3ZlciBpdC5cbiAgICAgIHZhciBpZHNUb1JlbW92ZSA9IFtdO1xuICAgICAgc2VsZi5fcHVibGlzaGVkLmZvckVhY2goZnVuY3Rpb24gKGRvYywgaWQpIHtcbiAgICAgICAgaWYgKCFuZXdSZXN1bHRzLmhhcyhpZCkpXG4gICAgICAgICAgaWRzVG9SZW1vdmUucHVzaChpZCk7XG4gICAgICB9KTtcbiAgICAgIF8uZWFjaChpZHNUb1JlbW92ZSwgZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHNlbGYuX3JlbW92ZVB1Ymxpc2hlZChpZCk7XG4gICAgICB9KTtcblxuICAgICAgLy8gTm93IGRvIGFkZHMgYW5kIGNoYW5nZXMuXG4gICAgICAvLyBJZiBzZWxmIGhhcyBhIGJ1ZmZlciBhbmQgbGltaXQsIHRoZSBuZXcgZmV0Y2hlZCByZXN1bHQgd2lsbCBiZVxuICAgICAgLy8gbGltaXRlZCBjb3JyZWN0bHkgYXMgdGhlIHF1ZXJ5IGhhcyBzb3J0IHNwZWNpZmllci5cbiAgICAgIG5ld1Jlc3VsdHMuZm9yRWFjaChmdW5jdGlvbiAoZG9jLCBpZCkge1xuICAgICAgICBzZWxmLl9oYW5kbGVEb2MoaWQsIGRvYyk7XG4gICAgICB9KTtcblxuICAgICAgLy8gU2FuaXR5LWNoZWNrIHRoYXQgZXZlcnl0aGluZyB3ZSB0cmllZCB0byBwdXQgaW50byBfcHVibGlzaGVkIGVuZGVkIHVwXG4gICAgICAvLyB0aGVyZS5cbiAgICAgIC8vIFhYWCBpZiB0aGlzIGlzIHNsb3csIHJlbW92ZSBpdCBsYXRlclxuICAgICAgaWYgKHNlbGYuX3B1Ymxpc2hlZC5zaXplKCkgIT09IG5ld1Jlc3VsdHMuc2l6ZSgpKSB7XG4gICAgICAgIE1ldGVvci5fZGVidWcoJ1RoZSBNb25nbyBzZXJ2ZXIgYW5kIHRoZSBNZXRlb3IgcXVlcnkgZGlzYWdyZWUgb24gaG93ICcgK1xuICAgICAgICAgICdtYW55IGRvY3VtZW50cyBtYXRjaCB5b3VyIHF1ZXJ5LiBDdXJzb3IgZGVzY3JpcHRpb246ICcsXG4gICAgICAgICAgc2VsZi5fY3Vyc29yRGVzY3JpcHRpb24pO1xuICAgICAgfVxuICAgICAgXG4gICAgICBzZWxmLl9wdWJsaXNoZWQuZm9yRWFjaChmdW5jdGlvbiAoZG9jLCBpZCkge1xuICAgICAgICBpZiAoIW5ld1Jlc3VsdHMuaGFzKGlkKSlcbiAgICAgICAgICB0aHJvdyBFcnJvcihcIl9wdWJsaXNoZWQgaGFzIGEgZG9jIHRoYXQgbmV3UmVzdWx0cyBkb2Vzbid0OyBcIiArIGlkKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBGaW5hbGx5LCByZXBsYWNlIHRoZSBidWZmZXJcbiAgICAgIG5ld0J1ZmZlci5mb3JFYWNoKGZ1bmN0aW9uIChkb2MsIGlkKSB7XG4gICAgICAgIHNlbGYuX2FkZEJ1ZmZlcmVkKGlkLCBkb2MpO1xuICAgICAgfSk7XG5cbiAgICAgIHNlbGYuX3NhZmVBcHBlbmRUb0J1ZmZlciA9IG5ld0J1ZmZlci5zaXplKCkgPCBzZWxmLl9saW1pdDtcbiAgICB9KTtcbiAgfSxcblxuICAvLyBUaGlzIHN0b3AgZnVuY3Rpb24gaXMgaW52b2tlZCBmcm9tIHRoZSBvblN0b3Agb2YgdGhlIE9ic2VydmVNdWx0aXBsZXhlciwgc29cbiAgLy8gaXQgc2hvdWxkbid0IGFjdHVhbGx5IGJlIHBvc3NpYmxlIHRvIGNhbGwgaXQgdW50aWwgdGhlIG11bHRpcGxleGVyIGlzXG4gIC8vIHJlYWR5LlxuICAvL1xuICAvLyBJdCdzIGltcG9ydGFudCB0byBjaGVjayBzZWxmLl9zdG9wcGVkIGFmdGVyIGV2ZXJ5IGNhbGwgaW4gdGhpcyBmaWxlIHRoYXRcbiAgLy8gY2FuIHlpZWxkIVxuICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmIChzZWxmLl9zdG9wcGVkKVxuICAgICAgcmV0dXJuO1xuICAgIHNlbGYuX3N0b3BwZWQgPSB0cnVlO1xuICAgIF8uZWFjaChzZWxmLl9zdG9wSGFuZGxlcywgZnVuY3Rpb24gKGhhbmRsZSkge1xuICAgICAgaGFuZGxlLnN0b3AoKTtcbiAgICB9KTtcblxuICAgIC8vIE5vdGU6IHdlICpkb24ndCogdXNlIG11bHRpcGxleGVyLm9uRmx1c2ggaGVyZSBiZWNhdXNlIHRoaXMgc3RvcFxuICAgIC8vIGNhbGxiYWNrIGlzIGFjdHVhbGx5IGludm9rZWQgYnkgdGhlIG11bHRpcGxleGVyIGl0c2VsZiB3aGVuIGl0IGhhc1xuICAgIC8vIGRldGVybWluZWQgdGhhdCB0aGVyZSBhcmUgbm8gaGFuZGxlcyBsZWZ0LiBTbyBub3RoaW5nIGlzIGFjdHVhbGx5IGdvaW5nXG4gICAgLy8gdG8gZ2V0IGZsdXNoZWQgKGFuZCBpdCdzIHByb2JhYmx5IG5vdCB2YWxpZCB0byBjYWxsIG1ldGhvZHMgb24gdGhlXG4gICAgLy8gZHlpbmcgbXVsdGlwbGV4ZXIpLlxuICAgIF8uZWFjaChzZWxmLl93cml0ZXNUb0NvbW1pdFdoZW5XZVJlYWNoU3RlYWR5LCBmdW5jdGlvbiAodykge1xuICAgICAgdy5jb21taXR0ZWQoKTsgIC8vIG1heWJlIHlpZWxkcz9cbiAgICB9KTtcbiAgICBzZWxmLl93cml0ZXNUb0NvbW1pdFdoZW5XZVJlYWNoU3RlYWR5ID0gbnVsbDtcblxuICAgIC8vIFByb2FjdGl2ZWx5IGRyb3AgcmVmZXJlbmNlcyB0byBwb3RlbnRpYWxseSBiaWcgdGhpbmdzLlxuICAgIHNlbGYuX3B1Ymxpc2hlZCA9IG51bGw7XG4gICAgc2VsZi5fdW5wdWJsaXNoZWRCdWZmZXIgPSBudWxsO1xuICAgIHNlbGYuX25lZWRUb0ZldGNoID0gbnVsbDtcbiAgICBzZWxmLl9jdXJyZW50bHlGZXRjaGluZyA9IG51bGw7XG4gICAgc2VsZi5fb3Bsb2dFbnRyeUhhbmRsZSA9IG51bGw7XG4gICAgc2VsZi5fbGlzdGVuZXJzSGFuZGxlID0gbnVsbDtcblxuICAgIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICAgIFwibW9uZ28tbGl2ZWRhdGFcIiwgXCJvYnNlcnZlLWRyaXZlcnMtb3Bsb2dcIiwgLTEpO1xuICB9LFxuXG4gIF9yZWdpc3RlclBoYXNlQ2hhbmdlOiBmdW5jdGlvbiAocGhhc2UpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG5vdyA9IG5ldyBEYXRlO1xuXG4gICAgICBpZiAoc2VsZi5fcGhhc2UpIHtcbiAgICAgICAgdmFyIHRpbWVEaWZmID0gbm93IC0gc2VsZi5fcGhhc2VTdGFydFRpbWU7XG4gICAgICAgIFBhY2thZ2VbJ2ZhY3RzLWJhc2UnXSAmJiBQYWNrYWdlWydmYWN0cy1iYXNlJ10uRmFjdHMuaW5jcmVtZW50U2VydmVyRmFjdChcbiAgICAgICAgICBcIm1vbmdvLWxpdmVkYXRhXCIsIFwidGltZS1zcGVudC1pbi1cIiArIHNlbGYuX3BoYXNlICsgXCItcGhhc2VcIiwgdGltZURpZmYpO1xuICAgICAgfVxuXG4gICAgICBzZWxmLl9waGFzZSA9IHBoYXNlO1xuICAgICAgc2VsZi5fcGhhc2VTdGFydFRpbWUgPSBub3c7XG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBEb2VzIG91ciBvcGxvZyB0YWlsaW5nIGNvZGUgc3VwcG9ydCB0aGlzIGN1cnNvcj8gRm9yIG5vdywgd2UgYXJlIGJlaW5nIHZlcnlcbi8vIGNvbnNlcnZhdGl2ZSBhbmQgYWxsb3dpbmcgb25seSBzaW1wbGUgcXVlcmllcyB3aXRoIHNpbXBsZSBvcHRpb25zLlxuLy8gKFRoaXMgaXMgYSBcInN0YXRpYyBtZXRob2RcIi4pXG5PcGxvZ09ic2VydmVEcml2ZXIuY3Vyc29yU3VwcG9ydGVkID0gZnVuY3Rpb24gKGN1cnNvckRlc2NyaXB0aW9uLCBtYXRjaGVyKSB7XG4gIC8vIEZpcnN0LCBjaGVjayB0aGUgb3B0aW9ucy5cbiAgdmFyIG9wdGlvbnMgPSBjdXJzb3JEZXNjcmlwdGlvbi5vcHRpb25zO1xuXG4gIC8vIERpZCB0aGUgdXNlciBzYXkgbm8gZXhwbGljaXRseT9cbiAgLy8gdW5kZXJzY29yZWQgdmVyc2lvbiBvZiB0aGUgb3B0aW9uIGlzIENPTVBBVCB3aXRoIDEuMlxuICBpZiAob3B0aW9ucy5kaXNhYmxlT3Bsb2cgfHwgb3B0aW9ucy5fZGlzYWJsZU9wbG9nKVxuICAgIHJldHVybiBmYWxzZTtcblxuICAvLyBza2lwIGlzIG5vdCBzdXBwb3J0ZWQ6IHRvIHN1cHBvcnQgaXQgd2Ugd291bGQgbmVlZCB0byBrZWVwIHRyYWNrIG9mIGFsbFxuICAvLyBcInNraXBwZWRcIiBkb2N1bWVudHMgb3IgYXQgbGVhc3QgdGhlaXIgaWRzLlxuICAvLyBsaW1pdCB3L28gYSBzb3J0IHNwZWNpZmllciBpcyBub3Qgc3VwcG9ydGVkOiBjdXJyZW50IGltcGxlbWVudGF0aW9uIG5lZWRzIGFcbiAgLy8gZGV0ZXJtaW5pc3RpYyB3YXkgdG8gb3JkZXIgZG9jdW1lbnRzLlxuICBpZiAob3B0aW9ucy5za2lwIHx8IChvcHRpb25zLmxpbWl0ICYmICFvcHRpb25zLnNvcnQpKSByZXR1cm4gZmFsc2U7XG5cbiAgLy8gSWYgYSBmaWVsZHMgcHJvamVjdGlvbiBvcHRpb24gaXMgZ2l2ZW4gY2hlY2sgaWYgaXQgaXMgc3VwcG9ydGVkIGJ5XG4gIC8vIG1pbmltb25nbyAoc29tZSBvcGVyYXRvcnMgYXJlIG5vdCBzdXBwb3J0ZWQpLlxuICBjb25zdCBmaWVsZHMgPSBvcHRpb25zLmZpZWxkcyB8fCBvcHRpb25zLnByb2plY3Rpb247XG4gIGlmIChmaWVsZHMpIHtcbiAgICB0cnkge1xuICAgICAgTG9jYWxDb2xsZWN0aW9uLl9jaGVja1N1cHBvcnRlZFByb2plY3Rpb24oZmllbGRzKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZS5uYW1lID09PSBcIk1pbmltb25nb0Vycm9yXCIpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBXZSBkb24ndCBhbGxvdyB0aGUgZm9sbG93aW5nIHNlbGVjdG9yczpcbiAgLy8gICAtICR3aGVyZSAobm90IGNvbmZpZGVudCB0aGF0IHdlIHByb3ZpZGUgdGhlIHNhbWUgSlMgZW52aXJvbm1lbnRcbiAgLy8gICAgICAgICAgICAgYXMgTW9uZ28sIGFuZCBjYW4geWllbGQhKVxuICAvLyAgIC0gJG5lYXIgKGhhcyBcImludGVyZXN0aW5nXCIgcHJvcGVydGllcyBpbiBNb25nb0RCLCBsaWtlIHRoZSBwb3NzaWJpbGl0eVxuICAvLyAgICAgICAgICAgIG9mIHJldHVybmluZyBhbiBJRCBtdWx0aXBsZSB0aW1lcywgdGhvdWdoIGV2ZW4gcG9sbGluZyBtYXliZVxuICAvLyAgICAgICAgICAgIGhhdmUgYSBidWcgdGhlcmUpXG4gIC8vICAgICAgICAgICBYWFg6IG9uY2Ugd2Ugc3VwcG9ydCBpdCwgd2Ugd291bGQgbmVlZCB0byB0aGluayBtb3JlIG9uIGhvdyB3ZVxuICAvLyAgICAgICAgICAgaW5pdGlhbGl6ZSB0aGUgY29tcGFyYXRvcnMgd2hlbiB3ZSBjcmVhdGUgdGhlIGRyaXZlci5cbiAgcmV0dXJuICFtYXRjaGVyLmhhc1doZXJlKCkgJiYgIW1hdGNoZXIuaGFzR2VvUXVlcnkoKTtcbn07XG5cbnZhciBtb2RpZmllckNhbkJlRGlyZWN0bHlBcHBsaWVkID0gZnVuY3Rpb24gKG1vZGlmaWVyKSB7XG4gIHJldHVybiBfLmFsbChtb2RpZmllciwgZnVuY3Rpb24gKGZpZWxkcywgb3BlcmF0aW9uKSB7XG4gICAgcmV0dXJuIF8uYWxsKGZpZWxkcywgZnVuY3Rpb24gKHZhbHVlLCBmaWVsZCkge1xuICAgICAgcmV0dXJuICEvRUpTT05cXCQvLnRlc3QoZmllbGQpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbk1vbmdvSW50ZXJuYWxzLk9wbG9nT2JzZXJ2ZURyaXZlciA9IE9wbG9nT2JzZXJ2ZURyaXZlcjtcbiIsIi8vIENvbnZlcnRlciBvZiB0aGUgbmV3IE1vbmdvREIgT3Bsb2cgZm9ybWF0ICg+PTUuMCkgdG8gdGhlIG9uZSB0aGF0IE1ldGVvclxuLy8gaGFuZGxlcyB3ZWxsLCBpLmUuLCBgJHNldGAgYW5kIGAkdW5zZXRgLiBUaGUgbmV3IGZvcm1hdCBpcyBjb21wbGV0ZWx5IG5ldyxcbi8vIGFuZCBsb29rcyBhcyBmb2xsb3dzOlxuLy9cbi8vICAgeyAkdjogMiwgZGlmZjogRGlmZiB9XG4vL1xuLy8gd2hlcmUgYERpZmZgIGlzIGEgcmVjdXJzaXZlIHN0cnVjdHVyZTpcbi8vXG4vLyAgIHtcbi8vICAgICAvLyBOZXN0ZWQgdXBkYXRlcyAoc29tZXRpbWVzIGFsc28gcmVwcmVzZW50ZWQgd2l0aCBhbiBzLWZpZWxkKS5cbi8vICAgICAvLyBFeGFtcGxlOiBgeyAkc2V0OiB7ICdmb28uYmFyJzogMSB9IH1gLlxuLy8gICAgIGk6IHsgPGtleT46IDx2YWx1ZT4sIC4uLiB9LFxuLy9cbi8vICAgICAvLyBUb3AtbGV2ZWwgdXBkYXRlcy5cbi8vICAgICAvLyBFeGFtcGxlOiBgeyAkc2V0OiB7IGZvbzogeyBiYXI6IDEgfSB9IH1gLlxuLy8gICAgIHU6IHsgPGtleT46IDx2YWx1ZT4sIC4uLiB9LFxuLy9cbi8vICAgICAvLyBVbnNldHMuXG4vLyAgICAgLy8gRXhhbXBsZTogYHsgJHVuc2V0OiB7IGZvbzogJycgfSB9YC5cbi8vICAgICBkOiB7IDxrZXk+OiBmYWxzZSwgLi4uIH0sXG4vL1xuLy8gICAgIC8vIEFycmF5IG9wZXJhdGlvbnMuXG4vLyAgICAgLy8gRXhhbXBsZTogYHsgJHB1c2g6IHsgZm9vOiAnYmFyJyB9IH1gLlxuLy8gICAgIHM8a2V5PjogeyBhOiB0cnVlLCB1PGluZGV4PjogPHZhbHVlPiwgLi4uIH0sXG4vLyAgICAgLi4uXG4vL1xuLy8gICAgIC8vIE5lc3RlZCBvcGVyYXRpb25zIChzb21ldGltZXMgYWxzbyByZXByZXNlbnRlZCBpbiB0aGUgYGlgIGZpZWxkKS5cbi8vICAgICAvLyBFeGFtcGxlOiBgeyAkc2V0OiB7ICdmb28uYmFyJzogMSB9IH1gLlxuLy8gICAgIHM8a2V5PjogRGlmZixcbi8vICAgICAuLi5cbi8vICAgfVxuLy9cbi8vIChhbGwgZmllbGRzIGFyZSBvcHRpb25hbCkuXG5cbmZ1bmN0aW9uIGpvaW4ocHJlZml4LCBrZXkpIHtcbiAgcmV0dXJuIHByZWZpeCA/IGAke3ByZWZpeH0uJHtrZXl9YCA6IGtleTtcbn1cblxuY29uc3QgYXJyYXlPcGVyYXRvcktleVJlZ2V4ID0gL14oYXxbc3VdXFxkKykkLztcblxuZnVuY3Rpb24gaXNBcnJheU9wZXJhdG9yS2V5KGZpZWxkKSB7XG4gIHJldHVybiBhcnJheU9wZXJhdG9yS2V5UmVnZXgudGVzdChmaWVsZCk7XG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlPcGVyYXRvcihvcGVyYXRvcikge1xuICByZXR1cm4gb3BlcmF0b3IuYSA9PT0gdHJ1ZSAmJiBPYmplY3Qua2V5cyhvcGVyYXRvcikuZXZlcnkoaXNBcnJheU9wZXJhdG9yS2V5KTtcbn1cblxuZnVuY3Rpb24gZmxhdHRlbk9iamVjdEludG8odGFyZ2V0LCBzb3VyY2UsIHByZWZpeCkge1xuICBpZiAoQXJyYXkuaXNBcnJheShzb3VyY2UpIHx8IHR5cGVvZiBzb3VyY2UgIT09ICdvYmplY3QnIHx8IHNvdXJjZSA9PT0gbnVsbCkge1xuICAgIHRhcmdldFtwcmVmaXhdID0gc291cmNlO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhzb3VyY2UpO1xuICAgIGlmIChlbnRyaWVzLmxlbmd0aCkge1xuICAgICAgZW50cmllcy5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgICAgZmxhdHRlbk9iamVjdEludG8odGFyZ2V0LCB2YWx1ZSwgam9pbihwcmVmaXgsIGtleSkpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRhcmdldFtwcmVmaXhdID0gc291cmNlO1xuICAgIH1cbiAgfVxufVxuXG5jb25zdCBsb2dEZWJ1Z01lc3NhZ2VzID0gISFwcm9jZXNzLmVudi5PUExPR19DT05WRVJURVJfREVCVUc7XG5cbmZ1bmN0aW9uIGNvbnZlcnRPcGxvZ0RpZmYob3Bsb2dFbnRyeSwgZGlmZiwgcHJlZml4KSB7XG4gIGlmIChsb2dEZWJ1Z01lc3NhZ2VzKSB7XG4gICAgY29uc29sZS5sb2coYGNvbnZlcnRPcGxvZ0RpZmYoJHtKU09OLnN0cmluZ2lmeShvcGxvZ0VudHJ5KX0sICR7SlNPTi5zdHJpbmdpZnkoZGlmZil9LCAke0pTT04uc3RyaW5naWZ5KHByZWZpeCl9KWApO1xuICB9XG5cbiAgT2JqZWN0LmVudHJpZXMoZGlmZikuZm9yRWFjaCgoW2RpZmZLZXksIHZhbHVlXSkgPT4ge1xuICAgIGlmIChkaWZmS2V5ID09PSAnZCcpIHtcbiAgICAgIC8vIEhhbmRsZSBgJHVuc2V0YHMuXG4gICAgICBvcGxvZ0VudHJ5LiR1bnNldCA/Pz0ge307XG4gICAgICBPYmplY3Qua2V5cyh2YWx1ZSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICBvcGxvZ0VudHJ5LiR1bnNldFtqb2luKHByZWZpeCwga2V5KV0gPSB0cnVlO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChkaWZmS2V5ID09PSAnaScpIHtcbiAgICAgIC8vIEhhbmRsZSAocG90ZW50aWFsbHkpIG5lc3RlZCBgJHNldGBzLlxuICAgICAgb3Bsb2dFbnRyeS4kc2V0ID8/PSB7fTtcbiAgICAgIGZsYXR0ZW5PYmplY3RJbnRvKG9wbG9nRW50cnkuJHNldCwgdmFsdWUsIHByZWZpeCk7XG4gICAgfSBlbHNlIGlmIChkaWZmS2V5ID09PSAndScpIHtcbiAgICAgIC8vIEhhbmRsZSBmbGF0IGAkc2V0YHMuXG4gICAgICBvcGxvZ0VudHJ5LiRzZXQgPz89IHt9O1xuICAgICAgT2JqZWN0LmVudHJpZXModmFsdWUpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgICBvcGxvZ0VudHJ5LiRzZXRbam9pbihwcmVmaXgsIGtleSldID0gdmFsdWU7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gSGFuZGxlIHMtZmllbGRzLlxuICAgICAgY29uc3Qga2V5ID0gZGlmZktleS5zbGljZSgxKTtcbiAgICAgIGlmIChpc0FycmF5T3BlcmF0b3IodmFsdWUpKSB7XG4gICAgICAgIC8vIEFycmF5IG9wZXJhdG9yLlxuICAgICAgICBPYmplY3QuZW50cmllcyh2YWx1ZSkuZm9yRWFjaCgoW3Bvc2l0aW9uLCB2YWx1ZV0pID0+IHtcbiAgICAgICAgICBpZiAocG9zaXRpb24gPT09ICdhJykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHBvc2l0aW9uS2V5ID0gam9pbihqb2luKHByZWZpeCwga2V5KSwgcG9zaXRpb24uc2xpY2UoMSkpO1xuICAgICAgICAgIGlmIChwb3NpdGlvblswXSA9PT0gJ3MnKSB7XG4gICAgICAgICAgICBjb252ZXJ0T3Bsb2dEaWZmKG9wbG9nRW50cnksIHZhbHVlLCBwb3NpdGlvbktleSk7XG4gICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgb3Bsb2dFbnRyeS4kdW5zZXQgPz89IHt9O1xuICAgICAgICAgICAgb3Bsb2dFbnRyeS4kdW5zZXRbcG9zaXRpb25LZXldID0gdHJ1ZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb3Bsb2dFbnRyeS4kc2V0ID8/PSB7fTtcbiAgICAgICAgICAgIG9wbG9nRW50cnkuJHNldFtwb3NpdGlvbktleV0gPSB2YWx1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmIChrZXkpIHtcbiAgICAgICAgLy8gTmVzdGVkIG9iamVjdC5cbiAgICAgICAgY29udmVydE9wbG9nRGlmZihvcGxvZ0VudHJ5LCB2YWx1ZSwgam9pbihwcmVmaXgsIGtleSkpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGxvZ1YyVjFDb252ZXJ0ZXIob3Bsb2dFbnRyeSkge1xuICAvLyBQYXNzLXRocm91Z2ggdjEgYW5kIChwcm9iYWJseSkgaW52YWxpZCBlbnRyaWVzLlxuICBpZiAob3Bsb2dFbnRyeS4kdiAhPT0gMiB8fCAhb3Bsb2dFbnRyeS5kaWZmKSB7XG4gICAgcmV0dXJuIG9wbG9nRW50cnk7XG4gIH1cblxuICBjb25zdCBjb252ZXJ0ZWRPcGxvZ0VudHJ5ID0geyAkdjogMiB9O1xuICBjb252ZXJ0T3Bsb2dEaWZmKGNvbnZlcnRlZE9wbG9nRW50cnksIG9wbG9nRW50cnkuZGlmZiwgJycpO1xuICByZXR1cm4gY29udmVydGVkT3Bsb2dFbnRyeTtcbn1cbiIsIi8vIHNpbmdsZXRvblxuZXhwb3J0IGNvbnN0IExvY2FsQ29sbGVjdGlvbkRyaXZlciA9IG5ldyAoY2xhc3MgTG9jYWxDb2xsZWN0aW9uRHJpdmVyIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5ub0Nvbm5Db2xsZWN0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gIH1cblxuICBvcGVuKG5hbWUsIGNvbm4pIHtcbiAgICBpZiAoISBuYW1lKSB7XG4gICAgICByZXR1cm4gbmV3IExvY2FsQ29sbGVjdGlvbjtcbiAgICB9XG5cbiAgICBpZiAoISBjb25uKSB7XG4gICAgICByZXR1cm4gZW5zdXJlQ29sbGVjdGlvbihuYW1lLCB0aGlzLm5vQ29ubkNvbGxlY3Rpb25zKTtcbiAgICB9XG5cbiAgICBpZiAoISBjb25uLl9tb25nb19saXZlZGF0YV9jb2xsZWN0aW9ucykge1xuICAgICAgY29ubi5fbW9uZ29fbGl2ZWRhdGFfY29sbGVjdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIH1cblxuICAgIC8vIFhYWCBpcyB0aGVyZSBhIHdheSB0byBrZWVwIHRyYWNrIG9mIGEgY29ubmVjdGlvbidzIGNvbGxlY3Rpb25zIHdpdGhvdXRcbiAgICAvLyBkYW5nbGluZyBpdCBvZmYgdGhlIGNvbm5lY3Rpb24gb2JqZWN0P1xuICAgIHJldHVybiBlbnN1cmVDb2xsZWN0aW9uKG5hbWUsIGNvbm4uX21vbmdvX2xpdmVkYXRhX2NvbGxlY3Rpb25zKTtcbiAgfVxufSk7XG5cbmZ1bmN0aW9uIGVuc3VyZUNvbGxlY3Rpb24obmFtZSwgY29sbGVjdGlvbnMpIHtcbiAgcmV0dXJuIChuYW1lIGluIGNvbGxlY3Rpb25zKVxuICAgID8gY29sbGVjdGlvbnNbbmFtZV1cbiAgICA6IGNvbGxlY3Rpb25zW25hbWVdID0gbmV3IExvY2FsQ29sbGVjdGlvbihuYW1lKTtcbn1cbiIsImltcG9ydCB7XG4gIEFTWU5DX0NPTExFQ1RJT05fTUVUSE9EUyxcbiAgZ2V0QXN5bmNNZXRob2ROYW1lXG59IGZyb20gXCJtZXRlb3IvbWluaW1vbmdvL2NvbnN0YW50c1wiO1xuXG5Nb25nb0ludGVybmFscy5SZW1vdGVDb2xsZWN0aW9uRHJpdmVyID0gZnVuY3Rpb24gKFxuICBtb25nb191cmwsIG9wdGlvbnMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBzZWxmLm1vbmdvID0gbmV3IE1vbmdvQ29ubmVjdGlvbihtb25nb191cmwsIG9wdGlvbnMpO1xufTtcblxuY29uc3QgUkVNT1RFX0NPTExFQ1RJT05fTUVUSE9EUyA9IFtcbiAgJ19jcmVhdGVDYXBwZWRDb2xsZWN0aW9uJyxcbiAgJ19kcm9wSW5kZXgnLFxuICAnX2Vuc3VyZUluZGV4JyxcbiAgJ2NyZWF0ZUluZGV4JyxcbiAgJ2NvdW50RG9jdW1lbnRzJyxcbiAgJ2Ryb3BDb2xsZWN0aW9uJyxcbiAgJ2VzdGltYXRlZERvY3VtZW50Q291bnQnLFxuICAnZmluZCcsXG4gICdmaW5kT25lJyxcbiAgJ2luc2VydCcsXG4gICdyYXdDb2xsZWN0aW9uJyxcbiAgJ3JlbW92ZScsXG4gICd1cGRhdGUnLFxuICAndXBzZXJ0Jyxcbl07XG5cbk9iamVjdC5hc3NpZ24oTW9uZ29JbnRlcm5hbHMuUmVtb3RlQ29sbGVjdGlvbkRyaXZlci5wcm90b3R5cGUsIHtcbiAgb3BlbjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIHJldCA9IHt9O1xuICAgIFJFTU9URV9DT0xMRUNUSU9OX01FVEhPRFMuZm9yRWFjaChcbiAgICAgIGZ1bmN0aW9uIChtKSB7XG4gICAgICAgIHJldFttXSA9IF8uYmluZChzZWxmLm1vbmdvW21dLCBzZWxmLm1vbmdvLCBuYW1lKTtcblxuICAgICAgICBpZiAoIUFTWU5DX0NPTExFQ1RJT05fTUVUSE9EUy5pbmNsdWRlcyhtKSkgcmV0dXJuO1xuICAgICAgICBjb25zdCBhc3luY01ldGhvZE5hbWUgPSBnZXRBc3luY01ldGhvZE5hbWUobSk7XG4gICAgICAgIHJldFthc3luY01ldGhvZE5hbWVdID0gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXRbbV0oLi4uYXJncykpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgcmV0dXJuIHJldDtcbiAgfVxufSk7XG5cbi8vIENyZWF0ZSB0aGUgc2luZ2xldG9uIFJlbW90ZUNvbGxlY3Rpb25Ecml2ZXIgb25seSBvbiBkZW1hbmQsIHNvIHdlXG4vLyBvbmx5IHJlcXVpcmUgTW9uZ28gY29uZmlndXJhdGlvbiBpZiBpdCdzIGFjdHVhbGx5IHVzZWQgKGVnLCBub3QgaWZcbi8vIHlvdSdyZSBvbmx5IHRyeWluZyB0byByZWNlaXZlIGRhdGEgZnJvbSBhIHJlbW90ZSBERFAgc2VydmVyLilcbk1vbmdvSW50ZXJuYWxzLmRlZmF1bHRSZW1vdGVDb2xsZWN0aW9uRHJpdmVyID0gXy5vbmNlKGZ1bmN0aW9uICgpIHtcbiAgdmFyIGNvbm5lY3Rpb25PcHRpb25zID0ge307XG5cbiAgdmFyIG1vbmdvVXJsID0gcHJvY2Vzcy5lbnYuTU9OR09fVVJMO1xuXG4gIGlmIChwcm9jZXNzLmVudi5NT05HT19PUExPR19VUkwpIHtcbiAgICBjb25uZWN0aW9uT3B0aW9ucy5vcGxvZ1VybCA9IHByb2Nlc3MuZW52Lk1PTkdPX09QTE9HX1VSTDtcbiAgfVxuXG4gIGlmICghIG1vbmdvVXJsKVxuICAgIHRocm93IG5ldyBFcnJvcihcIk1PTkdPX1VSTCBtdXN0IGJlIHNldCBpbiBlbnZpcm9ubWVudFwiKTtcblxuICBjb25zdCBkcml2ZXIgPSBuZXcgTW9uZ29JbnRlcm5hbHMuUmVtb3RlQ29sbGVjdGlvbkRyaXZlcihtb25nb1VybCwgY29ubmVjdGlvbk9wdGlvbnMpO1xuXG4gIC8vIEFzIG1hbnkgZGVwbG95bWVudCB0b29scywgaW5jbHVkaW5nIE1ldGVvciBVcCwgc2VuZCByZXF1ZXN0cyB0byB0aGUgYXBwIGluXG4gIC8vIG9yZGVyIHRvIGNvbmZpcm0gdGhhdCB0aGUgZGVwbG95bWVudCBmaW5pc2hlZCBzdWNjZXNzZnVsbHksIGl0J3MgcmVxdWlyZWRcbiAgLy8gdG8ga25vdyBhYm91dCBhIGRhdGFiYXNlIGNvbm5lY3Rpb24gcHJvYmxlbSBiZWZvcmUgdGhlIGFwcCBzdGFydHMuIERvaW5nIHNvXG4gIC8vIGluIGEgYE1ldGVvci5zdGFydHVwYCBpcyBmaW5lLCBhcyB0aGUgYFdlYkFwcGAgaGFuZGxlcyByZXF1ZXN0cyBvbmx5IGFmdGVyXG4gIC8vIGFsbCBhcmUgZmluaXNoZWQuXG4gIE1ldGVvci5zdGFydHVwKCgpID0+IHtcbiAgICBQcm9taXNlLmF3YWl0KGRyaXZlci5tb25nby5jbGllbnQuY29ubmVjdCgpKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGRyaXZlcjtcbn0pO1xuIiwiLy8gb3B0aW9ucy5jb25uZWN0aW9uLCBpZiBnaXZlbiwgaXMgYSBMaXZlZGF0YUNsaWVudCBvciBMaXZlZGF0YVNlcnZlclxuLy8gWFhYIHByZXNlbnRseSB0aGVyZSBpcyBubyB3YXkgdG8gZGVzdHJveS9jbGVhbiB1cCBhIENvbGxlY3Rpb25cbmltcG9ydCB7XG4gIEFTWU5DX0NPTExFQ1RJT05fTUVUSE9EUyxcbiAgZ2V0QXN5bmNNZXRob2ROYW1lXG59IGZyb20gXCJtZXRlb3IvbWluaW1vbmdvL2NvbnN0YW50c1wiO1xuXG5pbXBvcnQgeyBub3JtYWxpemVQcm9qZWN0aW9uIH0gZnJvbSBcIi4vbW9uZ29fdXRpbHNcIjtcbmV4cG9ydCBmdW5jdGlvbiB3YXJuVXNpbmdPbGRBcGkgKFxuICAgIG1ldGhvZE5hbWUsXG4gICAgY29sbGVjdGlvbk5hbWUsXG4gICAgaXNDYWxsZWRGcm9tQXN5bmNcbiAgICl7XG4gIGlmIChcbiAgICBwcm9jZXNzLmVudi5XQVJOX1dIRU5fVVNJTkdfT0xEX0FQSSAmJiAvLyBhbHNvIGVuc3VyZXMgaXQgaXMgb24gdGhlIHNlcnZlclxuICAgICFpc0NhbGxlZEZyb21Bc3luYyAvLyBtdXN0IGJlIHRydWUgb3RoZXJ3aXNlIHdlIHNob3VsZCBsb2dcbiAgKSB7XG4gICBpZiAoY29sbGVjdGlvbk5hbWUgPT09IHVuZGVmaW5lZCB8fCBjb2xsZWN0aW9uTmFtZS5pbmNsdWRlcygnb3Bsb2cnKSkgcmV0dXJuXG4gICBjb25zb2xlLndhcm4oYFxuICAgXG4gICBDYWxsaW5nIG1ldGhvZCAke2NvbGxlY3Rpb25OYW1lfS4ke21ldGhvZE5hbWV9IGZyb20gb2xkIEFQSSBvbiBzZXJ2ZXIuXG4gICBUaGlzIG1ldGhvZCB3aWxsIGJlIHJlbW92ZWQsIGZyb20gdGhlIHNlcnZlciwgaW4gdmVyc2lvbiAzLlxuICAgVHJhY2UgaXMgYmVsb3c6YClcbiAgIGNvbnNvbGUudHJhY2UoKVxuIH07XG59XG4vKipcbiAqIEBzdW1tYXJ5IE5hbWVzcGFjZSBmb3IgTW9uZ29EQi1yZWxhdGVkIGl0ZW1zXG4gKiBAbmFtZXNwYWNlXG4gKi9cbk1vbmdvID0ge307XG5cbi8qKlxuICogQHN1bW1hcnkgQ29uc3RydWN0b3IgZm9yIGEgQ29sbGVjdGlvblxuICogQGxvY3VzIEFueXdoZXJlXG4gKiBAaW5zdGFuY2VuYW1lIGNvbGxlY3Rpb25cbiAqIEBjbGFzc1xuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGNvbGxlY3Rpb24uICBJZiBudWxsLCBjcmVhdGVzIGFuIHVubWFuYWdlZCAodW5zeW5jaHJvbml6ZWQpIGxvY2FsIGNvbGxlY3Rpb24uXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucy5jb25uZWN0aW9uIFRoZSBzZXJ2ZXIgY29ubmVjdGlvbiB0aGF0IHdpbGwgbWFuYWdlIHRoaXMgY29sbGVjdGlvbi4gVXNlcyB0aGUgZGVmYXVsdCBjb25uZWN0aW9uIGlmIG5vdCBzcGVjaWZpZWQuICBQYXNzIHRoZSByZXR1cm4gdmFsdWUgb2YgY2FsbGluZyBbYEREUC5jb25uZWN0YF0oI2RkcF9jb25uZWN0KSB0byBzcGVjaWZ5IGEgZGlmZmVyZW50IHNlcnZlci4gUGFzcyBgbnVsbGAgdG8gc3BlY2lmeSBubyBjb25uZWN0aW9uLiBVbm1hbmFnZWQgKGBuYW1lYCBpcyBudWxsKSBjb2xsZWN0aW9ucyBjYW5ub3Qgc3BlY2lmeSBhIGNvbm5lY3Rpb24uXG4gKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9ucy5pZEdlbmVyYXRpb24gVGhlIG1ldGhvZCBvZiBnZW5lcmF0aW5nIHRoZSBgX2lkYCBmaWVsZHMgb2YgbmV3IGRvY3VtZW50cyBpbiB0aGlzIGNvbGxlY3Rpb24uICBQb3NzaWJsZSB2YWx1ZXM6XG5cbiAtICoqYCdTVFJJTkcnYCoqOiByYW5kb20gc3RyaW5nc1xuIC0gKipgJ01PTkdPJ2AqKjogIHJhbmRvbSBbYE1vbmdvLk9iamVjdElEYF0oI21vbmdvX29iamVjdF9pZCkgdmFsdWVzXG5cblRoZSBkZWZhdWx0IGlkIGdlbmVyYXRpb24gdGVjaG5pcXVlIGlzIGAnU1RSSU5HJ2AuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLnRyYW5zZm9ybSBBbiBvcHRpb25hbCB0cmFuc2Zvcm1hdGlvbiBmdW5jdGlvbi4gRG9jdW1lbnRzIHdpbGwgYmUgcGFzc2VkIHRocm91Z2ggdGhpcyBmdW5jdGlvbiBiZWZvcmUgYmVpbmcgcmV0dXJuZWQgZnJvbSBgZmV0Y2hgIG9yIGBmaW5kT25lYCwgYW5kIGJlZm9yZSBiZWluZyBwYXNzZWQgdG8gY2FsbGJhY2tzIG9mIGBvYnNlcnZlYCwgYG1hcGAsIGBmb3JFYWNoYCwgYGFsbG93YCwgYW5kIGBkZW55YC4gVHJhbnNmb3JtcyBhcmUgKm5vdCogYXBwbGllZCBmb3IgdGhlIGNhbGxiYWNrcyBvZiBgb2JzZXJ2ZUNoYW5nZXNgIG9yIHRvIGN1cnNvcnMgcmV0dXJuZWQgZnJvbSBwdWJsaXNoIGZ1bmN0aW9ucy5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5kZWZpbmVNdXRhdGlvbk1ldGhvZHMgU2V0IHRvIGBmYWxzZWAgdG8gc2tpcCBzZXR0aW5nIHVwIHRoZSBtdXRhdGlvbiBtZXRob2RzIHRoYXQgZW5hYmxlIGluc2VydC91cGRhdGUvcmVtb3ZlIGZyb20gY2xpZW50IGNvZGUuIERlZmF1bHQgYHRydWVgLlxuICovXG5Nb25nby5Db2xsZWN0aW9uID0gZnVuY3Rpb24gQ29sbGVjdGlvbihuYW1lLCBvcHRpb25zKSB7XG4gIGlmICghbmFtZSAmJiBuYW1lICE9PSBudWxsKSB7XG4gICAgTWV0ZW9yLl9kZWJ1ZyhcbiAgICAgICdXYXJuaW5nOiBjcmVhdGluZyBhbm9ueW1vdXMgY29sbGVjdGlvbi4gSXQgd2lsbCBub3QgYmUgJyArXG4gICAgICAgICdzYXZlZCBvciBzeW5jaHJvbml6ZWQgb3ZlciB0aGUgbmV0d29yay4gKFBhc3MgbnVsbCBmb3IgJyArXG4gICAgICAgICd0aGUgY29sbGVjdGlvbiBuYW1lIHRvIHR1cm4gb2ZmIHRoaXMgd2FybmluZy4pJ1xuICAgICk7XG4gICAgbmFtZSA9IG51bGw7XG4gIH1cblxuICBpZiAobmFtZSAhPT0gbnVsbCAmJiB0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAnRmlyc3QgYXJndW1lbnQgdG8gbmV3IE1vbmdvLkNvbGxlY3Rpb24gbXVzdCBiZSBhIHN0cmluZyBvciBudWxsJ1xuICAgICk7XG4gIH1cblxuICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLm1ldGhvZHMpIHtcbiAgICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBoYWNrIHdpdGggb3JpZ2luYWwgc2lnbmF0dXJlICh3aGljaCBwYXNzZWRcbiAgICAvLyBcImNvbm5lY3Rpb25cIiBkaXJlY3RseSBpbnN0ZWFkIG9mIGluIG9wdGlvbnMuIChDb25uZWN0aW9ucyBtdXN0IGhhdmUgYSBcIm1ldGhvZHNcIlxuICAgIC8vIG1ldGhvZC4pXG4gICAgLy8gWFhYIHJlbW92ZSBiZWZvcmUgMS4wXG4gICAgb3B0aW9ucyA9IHsgY29ubmVjdGlvbjogb3B0aW9ucyB9O1xuICB9XG4gIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5OiBcImNvbm5lY3Rpb25cIiB1c2VkIHRvIGJlIGNhbGxlZCBcIm1hbmFnZXJcIi5cbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5tYW5hZ2VyICYmICFvcHRpb25zLmNvbm5lY3Rpb24pIHtcbiAgICBvcHRpb25zLmNvbm5lY3Rpb24gPSBvcHRpb25zLm1hbmFnZXI7XG4gIH1cblxuICBvcHRpb25zID0ge1xuICAgIGNvbm5lY3Rpb246IHVuZGVmaW5lZCxcbiAgICBpZEdlbmVyYXRpb246ICdTVFJJTkcnLFxuICAgIHRyYW5zZm9ybTogbnVsbCxcbiAgICBfZHJpdmVyOiB1bmRlZmluZWQsXG4gICAgX3ByZXZlbnRBdXRvcHVibGlzaDogZmFsc2UsXG4gICAgLi4ub3B0aW9ucyxcbiAgfTtcblxuICBzd2l0Y2ggKG9wdGlvbnMuaWRHZW5lcmF0aW9uKSB7XG4gICAgY2FzZSAnTU9OR08nOlxuICAgICAgdGhpcy5fbWFrZU5ld0lEID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBzcmMgPSBuYW1lXG4gICAgICAgICAgPyBERFAucmFuZG9tU3RyZWFtKCcvY29sbGVjdGlvbi8nICsgbmFtZSlcbiAgICAgICAgICA6IFJhbmRvbS5pbnNlY3VyZTtcbiAgICAgICAgcmV0dXJuIG5ldyBNb25nby5PYmplY3RJRChzcmMuaGV4U3RyaW5nKDI0KSk7XG4gICAgICB9O1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnU1RSSU5HJzpcbiAgICBkZWZhdWx0OlxuICAgICAgdGhpcy5fbWFrZU5ld0lEID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBzcmMgPSBuYW1lXG4gICAgICAgICAgPyBERFAucmFuZG9tU3RyZWFtKCcvY29sbGVjdGlvbi8nICsgbmFtZSlcbiAgICAgICAgICA6IFJhbmRvbS5pbnNlY3VyZTtcbiAgICAgICAgcmV0dXJuIHNyYy5pZCgpO1xuICAgICAgfTtcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgdGhpcy5fdHJhbnNmb3JtID0gTG9jYWxDb2xsZWN0aW9uLndyYXBUcmFuc2Zvcm0ob3B0aW9ucy50cmFuc2Zvcm0pO1xuXG4gIGlmICghbmFtZSB8fCBvcHRpb25zLmNvbm5lY3Rpb24gPT09IG51bGwpXG4gICAgLy8gbm90ZTogbmFtZWxlc3MgY29sbGVjdGlvbnMgbmV2ZXIgaGF2ZSBhIGNvbm5lY3Rpb25cbiAgICB0aGlzLl9jb25uZWN0aW9uID0gbnVsbDtcbiAgZWxzZSBpZiAob3B0aW9ucy5jb25uZWN0aW9uKSB0aGlzLl9jb25uZWN0aW9uID0gb3B0aW9ucy5jb25uZWN0aW9uO1xuICBlbHNlIGlmIChNZXRlb3IuaXNDbGllbnQpIHRoaXMuX2Nvbm5lY3Rpb24gPSBNZXRlb3IuY29ubmVjdGlvbjtcbiAgZWxzZSB0aGlzLl9jb25uZWN0aW9uID0gTWV0ZW9yLnNlcnZlcjtcblxuICBpZiAoIW9wdGlvbnMuX2RyaXZlcikge1xuICAgIC8vIFhYWCBUaGlzIGNoZWNrIGFzc3VtZXMgdGhhdCB3ZWJhcHAgaXMgbG9hZGVkIHNvIHRoYXQgTWV0ZW9yLnNlcnZlciAhPT1cbiAgICAvLyBudWxsLiBXZSBzaG91bGQgZnVsbHkgc3VwcG9ydCB0aGUgY2FzZSBvZiBcIndhbnQgdG8gdXNlIGEgTW9uZ28tYmFja2VkXG4gICAgLy8gY29sbGVjdGlvbiBmcm9tIE5vZGUgY29kZSB3aXRob3V0IHdlYmFwcFwiLCBidXQgd2UgZG9uJ3QgeWV0LlxuICAgIC8vICNNZXRlb3JTZXJ2ZXJOdWxsXG4gICAgaWYgKFxuICAgICAgbmFtZSAmJlxuICAgICAgdGhpcy5fY29ubmVjdGlvbiA9PT0gTWV0ZW9yLnNlcnZlciAmJlxuICAgICAgdHlwZW9mIE1vbmdvSW50ZXJuYWxzICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgTW9uZ29JbnRlcm5hbHMuZGVmYXVsdFJlbW90ZUNvbGxlY3Rpb25Ecml2ZXJcbiAgICApIHtcbiAgICAgIG9wdGlvbnMuX2RyaXZlciA9IE1vbmdvSW50ZXJuYWxzLmRlZmF1bHRSZW1vdGVDb2xsZWN0aW9uRHJpdmVyKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHsgTG9jYWxDb2xsZWN0aW9uRHJpdmVyIH0gPSByZXF1aXJlKCcuL2xvY2FsX2NvbGxlY3Rpb25fZHJpdmVyLmpzJyk7XG4gICAgICBvcHRpb25zLl9kcml2ZXIgPSBMb2NhbENvbGxlY3Rpb25Ecml2ZXI7XG4gICAgfVxuICB9XG5cbiAgdGhpcy5fY29sbGVjdGlvbiA9IG9wdGlvbnMuX2RyaXZlci5vcGVuKG5hbWUsIHRoaXMuX2Nvbm5lY3Rpb24pO1xuICB0aGlzLl9uYW1lID0gbmFtZTtcbiAgdGhpcy5fZHJpdmVyID0gb3B0aW9ucy5fZHJpdmVyO1xuXG4gIHRoaXMuX21heWJlU2V0VXBSZXBsaWNhdGlvbihuYW1lLCBvcHRpb25zKTtcblxuICAvLyBYWFggZG9uJ3QgZGVmaW5lIHRoZXNlIHVudGlsIGFsbG93IG9yIGRlbnkgaXMgYWN0dWFsbHkgdXNlZCBmb3IgdGhpc1xuICAvLyBjb2xsZWN0aW9uLiBDb3VsZCBiZSBoYXJkIGlmIHRoZSBzZWN1cml0eSBydWxlcyBhcmUgb25seSBkZWZpbmVkIG9uIHRoZVxuICAvLyBzZXJ2ZXIuXG4gIGlmIChvcHRpb25zLmRlZmluZU11dGF0aW9uTWV0aG9kcyAhPT0gZmFsc2UpIHtcbiAgICB0cnkge1xuICAgICAgdGhpcy5fZGVmaW5lTXV0YXRpb25NZXRob2RzKHtcbiAgICAgICAgdXNlRXhpc3Rpbmc6IG9wdGlvbnMuX3N1cHByZXNzU2FtZU5hbWVFcnJvciA9PT0gdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBUaHJvdyBhIG1vcmUgdW5kZXJzdGFuZGFibGUgZXJyb3Igb24gdGhlIHNlcnZlciBmb3Igc2FtZSBjb2xsZWN0aW9uIG5hbWVcbiAgICAgIGlmIChcbiAgICAgICAgZXJyb3IubWVzc2FnZSA9PT0gYEEgbWV0aG9kIG5hbWVkICcvJHtuYW1lfS9pbnNlcnQnIGlzIGFscmVhZHkgZGVmaW5lZGBcbiAgICAgIClcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUaGVyZSBpcyBhbHJlYWR5IGEgY29sbGVjdGlvbiBuYW1lZCBcIiR7bmFtZX1cImApO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLy8gYXV0b3B1Ymxpc2hcbiAgaWYgKFxuICAgIFBhY2thZ2UuYXV0b3B1Ymxpc2ggJiZcbiAgICAhb3B0aW9ucy5fcHJldmVudEF1dG9wdWJsaXNoICYmXG4gICAgdGhpcy5fY29ubmVjdGlvbiAmJlxuICAgIHRoaXMuX2Nvbm5lY3Rpb24ucHVibGlzaFxuICApIHtcbiAgICB0aGlzLl9jb25uZWN0aW9uLnB1Ymxpc2gobnVsbCwgKCkgPT4gdGhpcy5maW5kKCksIHtcbiAgICAgIGlzX2F1dG86IHRydWUsXG4gICAgfSk7XG4gIH1cbn07XG5cbk9iamVjdC5hc3NpZ24oTW9uZ28uQ29sbGVjdGlvbi5wcm90b3R5cGUsIHtcbiAgX21heWJlU2V0VXBSZXBsaWNhdGlvbihuYW1lLCB7IF9zdXBwcmVzc1NhbWVOYW1lRXJyb3IgPSBmYWxzZSB9KSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCEoc2VsZi5fY29ubmVjdGlvbiAmJiBzZWxmLl9jb25uZWN0aW9uLnJlZ2lzdGVyU3RvcmUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gT0ssIHdlJ3JlIGdvaW5nIHRvIGJlIGEgc2xhdmUsIHJlcGxpY2F0aW5nIHNvbWUgcmVtb3RlXG4gICAgLy8gZGF0YWJhc2UsIGV4Y2VwdCBwb3NzaWJseSB3aXRoIHNvbWUgdGVtcG9yYXJ5IGRpdmVyZ2VuY2Ugd2hpbGVcbiAgICAvLyB3ZSBoYXZlIHVuYWNrbm93bGVkZ2VkIFJQQydzLlxuICAgIGNvbnN0IG9rID0gc2VsZi5fY29ubmVjdGlvbi5yZWdpc3RlclN0b3JlKG5hbWUsIHtcbiAgICAgIC8vIENhbGxlZCBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgYmF0Y2ggb2YgdXBkYXRlcy4gYmF0Y2hTaXplIGlzIHRoZSBudW1iZXJcbiAgICAgIC8vIG9mIHVwZGF0ZSBjYWxscyB0byBleHBlY3QuXG4gICAgICAvL1xuICAgICAgLy8gWFhYIFRoaXMgaW50ZXJmYWNlIGlzIHByZXR0eSBqYW5reS4gcmVzZXQgcHJvYmFibHkgb3VnaHQgdG8gZ28gYmFjayB0b1xuICAgICAgLy8gYmVpbmcgaXRzIG93biBmdW5jdGlvbiwgYW5kIGNhbGxlcnMgc2hvdWxkbid0IGhhdmUgdG8gY2FsY3VsYXRlXG4gICAgICAvLyBiYXRjaFNpemUuIFRoZSBvcHRpbWl6YXRpb24gb2Ygbm90IGNhbGxpbmcgcGF1c2UvcmVtb3ZlIHNob3VsZCBiZVxuICAgICAgLy8gZGVsYXllZCB1bnRpbCBsYXRlcjogdGhlIGZpcnN0IGNhbGwgdG8gdXBkYXRlKCkgc2hvdWxkIGJ1ZmZlciBpdHNcbiAgICAgIC8vIG1lc3NhZ2UsIGFuZCB0aGVuIHdlIGNhbiBlaXRoZXIgZGlyZWN0bHkgYXBwbHkgaXQgYXQgZW5kVXBkYXRlIHRpbWUgaWZcbiAgICAgIC8vIGl0IHdhcyB0aGUgb25seSB1cGRhdGUsIG9yIGRvIHBhdXNlT2JzZXJ2ZXJzL2FwcGx5L2FwcGx5IGF0IHRoZSBuZXh0XG4gICAgICAvLyB1cGRhdGUoKSBpZiB0aGVyZSdzIGFub3RoZXIgb25lLlxuICAgICAgYmVnaW5VcGRhdGUoYmF0Y2hTaXplLCByZXNldCkge1xuICAgICAgICAvLyBwYXVzZSBvYnNlcnZlcnMgc28gdXNlcnMgZG9uJ3Qgc2VlIGZsaWNrZXIgd2hlbiB1cGRhdGluZyBzZXZlcmFsXG4gICAgICAgIC8vIG9iamVjdHMgYXQgb25jZSAoaW5jbHVkaW5nIHRoZSBwb3N0LXJlY29ubmVjdCByZXNldC1hbmQtcmVhcHBseVxuICAgICAgICAvLyBzdGFnZSksIGFuZCBzbyB0aGF0IGEgcmUtc29ydGluZyBvZiBhIHF1ZXJ5IGNhbiB0YWtlIGFkdmFudGFnZSBvZiB0aGVcbiAgICAgICAgLy8gZnVsbCBfZGlmZlF1ZXJ5IG1vdmVkIGNhbGN1bGF0aW9uIGluc3RlYWQgb2YgYXBwbHlpbmcgY2hhbmdlIG9uZSBhdCBhXG4gICAgICAgIC8vIHRpbWUuXG4gICAgICAgIGlmIChiYXRjaFNpemUgPiAxIHx8IHJlc2V0KSBzZWxmLl9jb2xsZWN0aW9uLnBhdXNlT2JzZXJ2ZXJzKCk7XG5cbiAgICAgICAgaWYgKHJlc2V0KSBzZWxmLl9jb2xsZWN0aW9uLnJlbW92ZSh7fSk7XG4gICAgICB9LFxuXG4gICAgICAvLyBBcHBseSBhbiB1cGRhdGUuXG4gICAgICAvLyBYWFggYmV0dGVyIHNwZWNpZnkgdGhpcyBpbnRlcmZhY2UgKG5vdCBpbiB0ZXJtcyBvZiBhIHdpcmUgbWVzc2FnZSk/XG4gICAgICB1cGRhdGUobXNnKSB7XG4gICAgICAgIHZhciBtb25nb0lkID0gTW9uZ29JRC5pZFBhcnNlKG1zZy5pZCk7XG4gICAgICAgIHZhciBkb2MgPSBzZWxmLl9jb2xsZWN0aW9uLl9kb2NzLmdldChtb25nb0lkKTtcblxuICAgICAgICAvL1doZW4gdGhlIHNlcnZlcidzIG1lcmdlYm94IGlzIGRpc2FibGVkIGZvciBhIGNvbGxlY3Rpb24sIHRoZSBjbGllbnQgbXVzdCBncmFjZWZ1bGx5IGhhbmRsZSBpdCB3aGVuOlxuICAgICAgICAvLyAqV2UgcmVjZWl2ZSBhbiBhZGRlZCBtZXNzYWdlIGZvciBhIGRvY3VtZW50IHRoYXQgaXMgYWxyZWFkeSB0aGVyZS4gSW5zdGVhZCwgaXQgd2lsbCBiZSBjaGFuZ2VkXG4gICAgICAgIC8vICpXZSByZWVpdmUgYSBjaGFuZ2UgbWVzc2FnZSBmb3IgYSBkb2N1bWVudCB0aGF0IGlzIG5vdCB0aGVyZS4gSW5zdGVhZCwgaXQgd2lsbCBiZSBhZGRlZFxuICAgICAgICAvLyAqV2UgcmVjZWl2ZSBhIHJlbW92ZWQgbWVzc3NhZ2UgZm9yIGEgZG9jdW1lbnQgdGhhdCBpcyBub3QgdGhlcmUuIEluc3RlYWQsIG5vdGluZyB3aWwgaGFwcGVuLlxuXG4gICAgICAgIC8vQ29kZSBpcyBkZXJpdmVkIGZyb20gY2xpZW50LXNpZGUgY29kZSBvcmlnaW5hbGx5IGluIHBlZXJsaWJyYXJ5OmNvbnRyb2wtbWVyZ2Vib3hcbiAgICAgICAgLy9odHRwczovL2dpdGh1Yi5jb20vcGVlcmxpYnJhcnkvbWV0ZW9yLWNvbnRyb2wtbWVyZ2Vib3gvYmxvYi9tYXN0ZXIvY2xpZW50LmNvZmZlZVxuXG4gICAgICAgIC8vRm9yIG1vcmUgaW5mb3JtYXRpb24sIHJlZmVyIHRvIGRpc2N1c3Npb24gXCJJbml0aWFsIHN1cHBvcnQgZm9yIHB1YmxpY2F0aW9uIHN0cmF0ZWdpZXMgaW4gbGl2ZWRhdGEgc2VydmVyXCI6XG4gICAgICAgIC8vaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvcHVsbC8xMTE1MVxuICAgICAgICBpZiAoTWV0ZW9yLmlzQ2xpZW50KSB7XG4gICAgICAgICAgaWYgKG1zZy5tc2cgPT09ICdhZGRlZCcgJiYgZG9jKSB7XG4gICAgICAgICAgICBtc2cubXNnID0gJ2NoYW5nZWQnO1xuICAgICAgICAgIH0gZWxzZSBpZiAobXNnLm1zZyA9PT0gJ3JlbW92ZWQnICYmICFkb2MpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1zZy5tc2cgPT09ICdjaGFuZ2VkJyAmJiAhZG9jKSB7XG4gICAgICAgICAgICBtc2cubXNnID0gJ2FkZGVkJztcbiAgICAgICAgICAgIF9yZWYgPSBtc2cuZmllbGRzO1xuICAgICAgICAgICAgZm9yIChmaWVsZCBpbiBfcmVmKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gX3JlZltmaWVsZF07XG4gICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIG1zZy5maWVsZHNbZmllbGRdO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSXMgdGhpcyBhIFwicmVwbGFjZSB0aGUgd2hvbGUgZG9jXCIgbWVzc2FnZSBjb21pbmcgZnJvbSB0aGUgcXVpZXNjZW5jZVxuICAgICAgICAvLyBvZiBtZXRob2Qgd3JpdGVzIHRvIGFuIG9iamVjdD8gKE5vdGUgdGhhdCAndW5kZWZpbmVkJyBpcyBhIHZhbGlkXG4gICAgICAgIC8vIHZhbHVlIG1lYW5pbmcgXCJyZW1vdmUgaXRcIi4pXG4gICAgICAgIGlmIChtc2cubXNnID09PSAncmVwbGFjZScpIHtcbiAgICAgICAgICB2YXIgcmVwbGFjZSA9IG1zZy5yZXBsYWNlO1xuICAgICAgICAgIGlmICghcmVwbGFjZSkge1xuICAgICAgICAgICAgaWYgKGRvYykgc2VsZi5fY29sbGVjdGlvbi5yZW1vdmUobW9uZ29JZCk7XG4gICAgICAgICAgfSBlbHNlIGlmICghZG9jKSB7XG4gICAgICAgICAgICBzZWxmLl9jb2xsZWN0aW9uLmluc2VydChyZXBsYWNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gWFhYIGNoZWNrIHRoYXQgcmVwbGFjZSBoYXMgbm8gJCBvcHNcbiAgICAgICAgICAgIHNlbGYuX2NvbGxlY3Rpb24udXBkYXRlKG1vbmdvSWQsIHJlcGxhY2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAobXNnLm1zZyA9PT0gJ2FkZGVkJykge1xuICAgICAgICAgIGlmIChkb2MpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgJ0V4cGVjdGVkIG5vdCB0byBmaW5kIGEgZG9jdW1lbnQgYWxyZWFkeSBwcmVzZW50IGZvciBhbiBhZGQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzZWxmLl9jb2xsZWN0aW9uLmluc2VydCh7IF9pZDogbW9uZ29JZCwgLi4ubXNnLmZpZWxkcyB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChtc2cubXNnID09PSAncmVtb3ZlZCcpIHtcbiAgICAgICAgICBpZiAoIWRvYylcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgJ0V4cGVjdGVkIHRvIGZpbmQgYSBkb2N1bWVudCBhbHJlYWR5IHByZXNlbnQgZm9yIHJlbW92ZWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIHNlbGYuX2NvbGxlY3Rpb24ucmVtb3ZlKG1vbmdvSWQpO1xuICAgICAgICB9IGVsc2UgaWYgKG1zZy5tc2cgPT09ICdjaGFuZ2VkJykge1xuICAgICAgICAgIGlmICghZG9jKSB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIHRvIGZpbmQgYSBkb2N1bWVudCB0byBjaGFuZ2UnKTtcbiAgICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMobXNnLmZpZWxkcyk7XG4gICAgICAgICAgaWYgKGtleXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdmFyIG1vZGlmaWVyID0ge307XG4gICAgICAgICAgICBrZXlzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBtc2cuZmllbGRzW2tleV07XG4gICAgICAgICAgICAgIGlmIChFSlNPTi5lcXVhbHMoZG9jW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIGlmICghbW9kaWZpZXIuJHVuc2V0KSB7XG4gICAgICAgICAgICAgICAgICBtb2RpZmllci4kdW5zZXQgPSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbW9kaWZpZXIuJHVuc2V0W2tleV0gPSAxO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghbW9kaWZpZXIuJHNldCkge1xuICAgICAgICAgICAgICAgICAgbW9kaWZpZXIuJHNldCA9IHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtb2RpZmllci4kc2V0W2tleV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMobW9kaWZpZXIpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgc2VsZi5fY29sbGVjdGlvbi51cGRhdGUobW9uZ29JZCwgbW9kaWZpZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJIGRvbid0IGtub3cgaG93IHRvIGRlYWwgd2l0aCB0aGlzIG1lc3NhZ2VcIik7XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIC8vIENhbGxlZCBhdCB0aGUgZW5kIG9mIGEgYmF0Y2ggb2YgdXBkYXRlcy5cbiAgICAgIGVuZFVwZGF0ZSgpIHtcbiAgICAgICAgc2VsZi5fY29sbGVjdGlvbi5yZXN1bWVPYnNlcnZlcnMoKTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIENhbGxlZCBhcm91bmQgbWV0aG9kIHN0dWIgaW52b2NhdGlvbnMgdG8gY2FwdHVyZSB0aGUgb3JpZ2luYWwgdmVyc2lvbnNcbiAgICAgIC8vIG9mIG1vZGlmaWVkIGRvY3VtZW50cy5cbiAgICAgIHNhdmVPcmlnaW5hbHMoKSB7XG4gICAgICAgIHNlbGYuX2NvbGxlY3Rpb24uc2F2ZU9yaWdpbmFscygpO1xuICAgICAgfSxcbiAgICAgIHJldHJpZXZlT3JpZ2luYWxzKCkge1xuICAgICAgICByZXR1cm4gc2VsZi5fY29sbGVjdGlvbi5yZXRyaWV2ZU9yaWdpbmFscygpO1xuICAgICAgfSxcblxuICAgICAgLy8gVXNlZCB0byBwcmVzZXJ2ZSBjdXJyZW50IHZlcnNpb25zIG9mIGRvY3VtZW50cyBhY3Jvc3MgYSBzdG9yZSByZXNldC5cbiAgICAgIGdldERvYyhpZCkge1xuICAgICAgICByZXR1cm4gc2VsZi5maW5kT25lKGlkKTtcbiAgICAgIH0sXG5cbiAgICAgIC8vIFRvIGJlIGFibGUgdG8gZ2V0IGJhY2sgdG8gdGhlIGNvbGxlY3Rpb24gZnJvbSB0aGUgc3RvcmUuXG4gICAgICBfZ2V0Q29sbGVjdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHNlbGY7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKCFvaykge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGBUaGVyZSBpcyBhbHJlYWR5IGEgY29sbGVjdGlvbiBuYW1lZCBcIiR7bmFtZX1cImA7XG4gICAgICBpZiAoX3N1cHByZXNzU2FtZU5hbWVFcnJvciA9PT0gdHJ1ZSkge1xuICAgICAgICAvLyBYWFggSW4gdGhlb3J5IHdlIGRvIG5vdCBoYXZlIHRvIHRocm93IHdoZW4gYG9rYCBpcyBmYWxzeS4gVGhlXG4gICAgICAgIC8vIHN0b3JlIGlzIGFscmVhZHkgZGVmaW5lZCBmb3IgdGhpcyBjb2xsZWN0aW9uIG5hbWUsIGJ1dCB0aGlzXG4gICAgICAgIC8vIHdpbGwgc2ltcGx5IGJlIGFub3RoZXIgcmVmZXJlbmNlIHRvIGl0IGFuZCBldmVyeXRoaW5nIHNob3VsZFxuICAgICAgICAvLyB3b3JrLiBIb3dldmVyLCB3ZSBoYXZlIGhpc3RvcmljYWxseSB0aHJvd24gYW4gZXJyb3IgaGVyZSwgc29cbiAgICAgICAgLy8gZm9yIG5vdyB3ZSB3aWxsIHNraXAgdGhlIGVycm9yIG9ubHkgd2hlbiBfc3VwcHJlc3NTYW1lTmFtZUVycm9yXG4gICAgICAgIC8vIGlzIGB0cnVlYCwgYWxsb3dpbmcgcGVvcGxlIHRvIG9wdCBpbiBhbmQgZ2l2ZSB0aGlzIHNvbWUgcmVhbFxuICAgICAgICAvLyB3b3JsZCB0ZXN0aW5nLlxuICAgICAgICBjb25zb2xlLndhcm4gPyBjb25zb2xlLndhcm4obWVzc2FnZSkgOiBjb25zb2xlLmxvZyhtZXNzYWdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgLy8vXG4gIC8vLyBNYWluIGNvbGxlY3Rpb24gQVBJXG4gIC8vL1xuICAvKipcbiAgICogQHN1bW1hcnkgR2V0cyB0aGUgbnVtYmVyIG9mIGRvY3VtZW50cyBtYXRjaGluZyB0aGUgZmlsdGVyLiBGb3IgYSBmYXN0IGNvdW50IG9mIHRoZSB0b3RhbCBkb2N1bWVudHMgaW4gYSBjb2xsZWN0aW9uIHNlZSBgZXN0aW1hdGVkRG9jdW1lbnRDb3VudGAuXG4gICAqIEBsb2N1cyBBbnl3aGVyZVxuICAgKiBAbWV0aG9kIGNvdW50RG9jdW1lbnRzXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IFtzZWxlY3Rvcl0gQSBxdWVyeSBkZXNjcmliaW5nIHRoZSBkb2N1bWVudHMgdG8gY291bnRcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBBbGwgb3B0aW9ucyBhcmUgbGlzdGVkIGluIFtNb25nb0RCIGRvY3VtZW50YXRpb25dKGh0dHBzOi8vbW9uZ29kYi5naXRodWIuaW8vbm9kZS1tb25nb2RiLW5hdGl2ZS80LjExL2ludGVyZmFjZXMvQ291bnREb2N1bWVudHNPcHRpb25zLmh0bWwpLiBQbGVhc2Ugbm90ZSB0aGF0IG5vdCBhbGwgb2YgdGhlbSBhcmUgYXZhaWxhYmxlIG9uIHRoZSBjbGllbnQuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPG51bWJlcj59XG4gICAqL1xuICBjb3VudERvY3VtZW50cyguLi5hcmdzKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uY291bnREb2N1bWVudHMoLi4uYXJncyk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEdldHMgYW4gZXN0aW1hdGUgb2YgdGhlIGNvdW50IG9mIGRvY3VtZW50cyBpbiBhIGNvbGxlY3Rpb24gdXNpbmcgY29sbGVjdGlvbiBtZXRhZGF0YS4gRm9yIGFuIGV4YWN0IGNvdW50IG9mIHRoZSBkb2N1bWVudHMgaW4gYSBjb2xsZWN0aW9uIHNlZSBgY291bnREb2N1bWVudHNgLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCBlc3RpbWF0ZWREb2N1bWVudENvdW50XG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIEFsbCBvcHRpb25zIGFyZSBsaXN0ZWQgaW4gW01vbmdvREIgZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9tb25nb2RiLmdpdGh1Yi5pby9ub2RlLW1vbmdvZGItbmF0aXZlLzQuMTEvaW50ZXJmYWNlcy9Fc3RpbWF0ZWREb2N1bWVudENvdW50T3B0aW9ucy5odG1sKS4gUGxlYXNlIG5vdGUgdGhhdCBub3QgYWxsIG9mIHRoZW0gYXJlIGF2YWlsYWJsZSBvbiB0aGUgY2xpZW50LlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxudW1iZXI+fVxuICAgKi9cbiAgZXN0aW1hdGVkRG9jdW1lbnRDb3VudCguLi5hcmdzKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uZXN0aW1hdGVkRG9jdW1lbnRDb3VudCguLi5hcmdzKTtcbiAgfSxcblxuICBfZ2V0RmluZFNlbGVjdG9yKGFyZ3MpIHtcbiAgICBpZiAoYXJncy5sZW5ndGggPT0gMCkgcmV0dXJuIHt9O1xuICAgIGVsc2UgcmV0dXJuIGFyZ3NbMF07XG4gIH0sXG5cbiAgX2dldEZpbmRPcHRpb25zKGFyZ3MpIHtcbiAgICBjb25zdCBbLCBvcHRpb25zXSA9IGFyZ3MgfHwgW107XG4gICAgY29uc3QgbmV3T3B0aW9ucyA9IG5vcm1hbGl6ZVByb2plY3Rpb24ob3B0aW9ucyk7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKGFyZ3MubGVuZ3RoIDwgMikge1xuICAgICAgcmV0dXJuIHsgdHJhbnNmb3JtOiBzZWxmLl90cmFuc2Zvcm0gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2soXG4gICAgICAgIG5ld09wdGlvbnMsXG4gICAgICAgIE1hdGNoLk9wdGlvbmFsKFxuICAgICAgICAgIE1hdGNoLk9iamVjdEluY2x1ZGluZyh7XG4gICAgICAgICAgICBwcm9qZWN0aW9uOiBNYXRjaC5PcHRpb25hbChNYXRjaC5PbmVPZihPYmplY3QsIHVuZGVmaW5lZCkpLFxuICAgICAgICAgICAgc29ydDogTWF0Y2guT3B0aW9uYWwoXG4gICAgICAgICAgICAgIE1hdGNoLk9uZU9mKE9iamVjdCwgQXJyYXksIEZ1bmN0aW9uLCB1bmRlZmluZWQpXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgbGltaXQ6IE1hdGNoLk9wdGlvbmFsKE1hdGNoLk9uZU9mKE51bWJlciwgdW5kZWZpbmVkKSksXG4gICAgICAgICAgICBza2lwOiBNYXRjaC5PcHRpb25hbChNYXRjaC5PbmVPZihOdW1iZXIsIHVuZGVmaW5lZCkpLFxuICAgICAgICAgIH0pXG4gICAgICAgIClcbiAgICAgICk7XG5cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdHJhbnNmb3JtOiBzZWxmLl90cmFuc2Zvcm0sXG4gICAgICAgIC4uLm5ld09wdGlvbnMsXG4gICAgICB9O1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgRmluZCB0aGUgZG9jdW1lbnRzIGluIGEgY29sbGVjdGlvbiB0aGF0IG1hdGNoIHRoZSBzZWxlY3Rvci5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgZmluZFxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtNb25nb1NlbGVjdG9yfSBbc2VsZWN0b3JdIEEgcXVlcnkgZGVzY3JpYmluZyB0aGUgZG9jdW1lbnRzIHRvIGZpbmRcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge01vbmdvU29ydFNwZWNpZmllcn0gb3B0aW9ucy5zb3J0IFNvcnQgb3JkZXIgKGRlZmF1bHQ6IG5hdHVyYWwgb3JkZXIpXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLnNraXAgTnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcCBhdCB0aGUgYmVnaW5uaW5nXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLmxpbWl0IE1heGltdW0gbnVtYmVyIG9mIHJlc3VsdHMgdG8gcmV0dXJuXG4gICAqIEBwYXJhbSB7TW9uZ29GaWVsZFNwZWNpZmllcn0gb3B0aW9ucy5maWVsZHMgRGljdGlvbmFyeSBvZiBmaWVsZHMgdG8gcmV0dXJuIG9yIGV4Y2x1ZGUuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5yZWFjdGl2ZSAoQ2xpZW50IG9ubHkpIERlZmF1bHQgYHRydWVgOyBwYXNzIGBmYWxzZWAgdG8gZGlzYWJsZSByZWFjdGl2aXR5XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMudHJhbnNmb3JtIE92ZXJyaWRlcyBgdHJhbnNmb3JtYCBvbiB0aGUgIFtgQ29sbGVjdGlvbmBdKCNjb2xsZWN0aW9ucykgZm9yIHRoaXMgY3Vyc29yLiAgUGFzcyBgbnVsbGAgdG8gZGlzYWJsZSB0cmFuc2Zvcm1hdGlvbi5cbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLmRpc2FibGVPcGxvZyAoU2VydmVyIG9ubHkpIFBhc3MgdHJ1ZSB0byBkaXNhYmxlIG9wbG9nLXRhaWxpbmcgb24gdGhpcyBxdWVyeS4gVGhpcyBhZmZlY3RzIHRoZSB3YXkgc2VydmVyIHByb2Nlc3NlcyBjYWxscyB0byBgb2JzZXJ2ZWAgb24gdGhpcyBxdWVyeS4gRGlzYWJsaW5nIHRoZSBvcGxvZyBjYW4gYmUgdXNlZnVsIHdoZW4gd29ya2luZyB3aXRoIGRhdGEgdGhhdCB1cGRhdGVzIGluIGxhcmdlIGJhdGNoZXMuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLnBvbGxpbmdJbnRlcnZhbE1zIChTZXJ2ZXIgb25seSkgV2hlbiBvcGxvZyBpcyBkaXNhYmxlZCAodGhyb3VnaCB0aGUgdXNlIG9mIGBkaXNhYmxlT3Bsb2dgIG9yIHdoZW4gb3RoZXJ3aXNlIG5vdCBhdmFpbGFibGUpLCB0aGUgZnJlcXVlbmN5IChpbiBtaWxsaXNlY29uZHMpIG9mIGhvdyBvZnRlbiB0byBwb2xsIHRoaXMgcXVlcnkgd2hlbiBvYnNlcnZpbmcgb24gdGhlIHNlcnZlci4gRGVmYXVsdHMgdG8gMTAwMDBtcyAoMTAgc2Vjb25kcykuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLnBvbGxpbmdUaHJvdHRsZU1zIChTZXJ2ZXIgb25seSkgV2hlbiBvcGxvZyBpcyBkaXNhYmxlZCAodGhyb3VnaCB0aGUgdXNlIG9mIGBkaXNhYmxlT3Bsb2dgIG9yIHdoZW4gb3RoZXJ3aXNlIG5vdCBhdmFpbGFibGUpLCB0aGUgbWluaW11bSB0aW1lIChpbiBtaWxsaXNlY29uZHMpIHRvIGFsbG93IGJldHdlZW4gcmUtcG9sbGluZyB3aGVuIG9ic2VydmluZyBvbiB0aGUgc2VydmVyLiBJbmNyZWFzaW5nIHRoaXMgd2lsbCBzYXZlIENQVSBhbmQgbW9uZ28gbG9hZCBhdCB0aGUgZXhwZW5zZSBvZiBzbG93ZXIgdXBkYXRlcyB0byB1c2Vycy4gRGVjcmVhc2luZyB0aGlzIGlzIG5vdCByZWNvbW1lbmRlZC4gRGVmYXVsdHMgdG8gNTBtcy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMubWF4VGltZU1zIChTZXJ2ZXIgb25seSkgSWYgc2V0LCBpbnN0cnVjdHMgTW9uZ29EQiB0byBzZXQgYSB0aW1lIGxpbWl0IGZvciB0aGlzIGN1cnNvcidzIG9wZXJhdGlvbnMuIElmIHRoZSBvcGVyYXRpb24gcmVhY2hlcyB0aGUgc3BlY2lmaWVkIHRpbWUgbGltaXQgKGluIG1pbGxpc2Vjb25kcykgd2l0aG91dCB0aGUgaGF2aW5nIGJlZW4gY29tcGxldGVkLCBhbiBleGNlcHRpb24gd2lsbCBiZSB0aHJvd24uIFVzZWZ1bCB0byBwcmV2ZW50IGFuIChhY2NpZGVudGFsIG9yIG1hbGljaW91cykgdW5vcHRpbWl6ZWQgcXVlcnkgZnJvbSBjYXVzaW5nIGEgZnVsbCBjb2xsZWN0aW9uIHNjYW4gdGhhdCB3b3VsZCBkaXNydXB0IG90aGVyIGRhdGFiYXNlIHVzZXJzLCBhdCB0aGUgZXhwZW5zZSBvZiBuZWVkaW5nIHRvIGhhbmRsZSB0aGUgcmVzdWx0aW5nIGVycm9yLlxuICAgKiBAcGFyYW0ge1N0cmluZ3xPYmplY3R9IG9wdGlvbnMuaGludCAoU2VydmVyIG9ubHkpIE92ZXJyaWRlcyBNb25nb0RCJ3MgZGVmYXVsdCBpbmRleCBzZWxlY3Rpb24gYW5kIHF1ZXJ5IG9wdGltaXphdGlvbiBwcm9jZXNzLiBTcGVjaWZ5IGFuIGluZGV4IHRvIGZvcmNlIGl0cyB1c2UsIGVpdGhlciBieSBpdHMgbmFtZSBvciBpbmRleCBzcGVjaWZpY2F0aW9uLiBZb3UgY2FuIGFsc28gc3BlY2lmeSBgeyAkbmF0dXJhbCA6IDEgfWAgdG8gZm9yY2UgYSBmb3J3YXJkcyBjb2xsZWN0aW9uIHNjYW4sIG9yIGB7ICRuYXR1cmFsIDogLTEgfWAgZm9yIGEgcmV2ZXJzZSBjb2xsZWN0aW9uIHNjYW4uIFNldHRpbmcgdGhpcyBpcyBvbmx5IHJlY29tbWVuZGVkIGZvciBhZHZhbmNlZCB1c2Vycy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMucmVhZFByZWZlcmVuY2UgKFNlcnZlciBvbmx5KSBTcGVjaWZpZXMgYSBjdXN0b20gTW9uZ29EQiBbYHJlYWRQcmVmZXJlbmNlYF0oaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL3JlYWQtcHJlZmVyZW5jZSkgZm9yIHRoaXMgcGFydGljdWxhciBjdXJzb3IuIFBvc3NpYmxlIHZhbHVlcyBhcmUgYHByaW1hcnlgLCBgcHJpbWFyeVByZWZlcnJlZGAsIGBzZWNvbmRhcnlgLCBgc2Vjb25kYXJ5UHJlZmVycmVkYCBhbmQgYG5lYXJlc3RgLlxuICAgKiBAcmV0dXJucyB7TW9uZ28uQ3Vyc29yfVxuICAgKi9cbiAgZmluZCguLi5hcmdzKSB7XG4gICAgLy8gQ29sbGVjdGlvbi5maW5kKCkgKHJldHVybiBhbGwgZG9jcykgYmVoYXZlcyBkaWZmZXJlbnRseVxuICAgIC8vIGZyb20gQ29sbGVjdGlvbi5maW5kKHVuZGVmaW5lZCkgKHJldHVybiAwIGRvY3MpLiAgc28gYmVcbiAgICAvLyBjYXJlZnVsIGFib3V0IHRoZSBsZW5ndGggb2YgYXJndW1lbnRzLlxuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLmZpbmQoXG4gICAgICB0aGlzLl9nZXRGaW5kU2VsZWN0b3IoYXJncyksXG4gICAgICB0aGlzLl9nZXRGaW5kT3B0aW9ucyhhcmdzKVxuICAgICk7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEZpbmRzIHRoZSBmaXJzdCBkb2N1bWVudCB0aGF0IG1hdGNoZXMgdGhlIHNlbGVjdG9yLCBhcyBvcmRlcmVkIGJ5IHNvcnQgYW5kIHNraXAgb3B0aW9ucy4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiBubyBtYXRjaGluZyBkb2N1bWVudCBpcyBmb3VuZC5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgZmluZE9uZVxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtNb25nb1NlbGVjdG9yfSBbc2VsZWN0b3JdIEEgcXVlcnkgZGVzY3JpYmluZyB0aGUgZG9jdW1lbnRzIHRvIGZpbmRcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge01vbmdvU29ydFNwZWNpZmllcn0gb3B0aW9ucy5zb3J0IFNvcnQgb3JkZXIgKGRlZmF1bHQ6IG5hdHVyYWwgb3JkZXIpXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLnNraXAgTnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcCBhdCB0aGUgYmVnaW5uaW5nXG4gICAqIEBwYXJhbSB7TW9uZ29GaWVsZFNwZWNpZmllcn0gb3B0aW9ucy5maWVsZHMgRGljdGlvbmFyeSBvZiBmaWVsZHMgdG8gcmV0dXJuIG9yIGV4Y2x1ZGUuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5yZWFjdGl2ZSAoQ2xpZW50IG9ubHkpIERlZmF1bHQgdHJ1ZTsgcGFzcyBmYWxzZSB0byBkaXNhYmxlIHJlYWN0aXZpdHlcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9ucy50cmFuc2Zvcm0gT3ZlcnJpZGVzIGB0cmFuc2Zvcm1gIG9uIHRoZSBbYENvbGxlY3Rpb25gXSgjY29sbGVjdGlvbnMpIGZvciB0aGlzIGN1cnNvci4gIFBhc3MgYG51bGxgIHRvIGRpc2FibGUgdHJhbnNmb3JtYXRpb24uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25zLnJlYWRQcmVmZXJlbmNlIChTZXJ2ZXIgb25seSkgU3BlY2lmaWVzIGEgY3VzdG9tIE1vbmdvREIgW2ByZWFkUHJlZmVyZW5jZWBdKGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9yZWFkLXByZWZlcmVuY2UpIGZvciBmZXRjaGluZyB0aGUgZG9jdW1lbnQuIFBvc3NpYmxlIHZhbHVlcyBhcmUgYHByaW1hcnlgLCBgcHJpbWFyeVByZWZlcnJlZGAsIGBzZWNvbmRhcnlgLCBgc2Vjb25kYXJ5UHJlZmVycmVkYCBhbmQgYG5lYXJlc3RgLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgKi9cbiAgZmluZE9uZSguLi5hcmdzKSB7XG4gICAgLy8gW0ZJQkVSU11cbiAgICAvLyBUT0RPOiBSZW1vdmUgdGhpcyB3aGVuIDMuMCBpcyByZWxlYXNlZC5cbiAgICB3YXJuVXNpbmdPbGRBcGkoXG4gICAgICBcImZpbmRPbmVcIixcbiAgICAgIHRoaXMuX25hbWUsXG4gICAgICB0aGlzLmZpbmRPbmUuaXNDYWxsZWRGcm9tQXN5bmNcbiAgICApO1xuICAgIHRoaXMuZmluZE9uZS5pc0NhbGxlZEZyb21Bc3luYyA9IGZhbHNlO1xuXG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uZmluZE9uZShcbiAgICAgIHRoaXMuX2dldEZpbmRTZWxlY3RvcihhcmdzKSxcbiAgICAgIHRoaXMuX2dldEZpbmRPcHRpb25zKGFyZ3MpXG4gICAgKTtcbiAgfSxcbn0pO1xuXG5PYmplY3QuYXNzaWduKE1vbmdvLkNvbGxlY3Rpb24sIHtcbiAgX3B1Ymxpc2hDdXJzb3IoY3Vyc29yLCBzdWIsIGNvbGxlY3Rpb24pIHtcbiAgICB2YXIgb2JzZXJ2ZUhhbmRsZSA9IGN1cnNvci5vYnNlcnZlQ2hhbmdlcyhcbiAgICAgIHtcbiAgICAgICAgYWRkZWQ6IGZ1bmN0aW9uKGlkLCBmaWVsZHMpIHtcbiAgICAgICAgICBzdWIuYWRkZWQoY29sbGVjdGlvbiwgaWQsIGZpZWxkcyk7XG4gICAgICAgIH0sXG4gICAgICAgIGNoYW5nZWQ6IGZ1bmN0aW9uKGlkLCBmaWVsZHMpIHtcbiAgICAgICAgICBzdWIuY2hhbmdlZChjb2xsZWN0aW9uLCBpZCwgZmllbGRzKTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVtb3ZlZDogZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgICBzdWIucmVtb3ZlZChjb2xsZWN0aW9uLCBpZCk7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgLy8gUHVibGljYXRpb25zIGRvbid0IG11dGF0ZSB0aGUgZG9jdW1lbnRzXG4gICAgICAvLyBUaGlzIGlzIHRlc3RlZCBieSB0aGUgYGxpdmVkYXRhIC0gcHVibGlzaCBjYWxsYmFja3MgY2xvbmVgIHRlc3RcbiAgICAgIHsgbm9uTXV0YXRpbmdDYWxsYmFja3M6IHRydWUgfVxuICAgICk7XG5cbiAgICAvLyBXZSBkb24ndCBjYWxsIHN1Yi5yZWFkeSgpIGhlcmU6IGl0IGdldHMgY2FsbGVkIGluIGxpdmVkYXRhX3NlcnZlciwgYWZ0ZXJcbiAgICAvLyBwb3NzaWJseSBjYWxsaW5nIF9wdWJsaXNoQ3Vyc29yIG9uIG11bHRpcGxlIHJldHVybmVkIGN1cnNvcnMuXG5cbiAgICAvLyByZWdpc3RlciBzdG9wIGNhbGxiYWNrIChleHBlY3RzIGxhbWJkYSB3LyBubyBhcmdzKS5cbiAgICBzdWIub25TdG9wKGZ1bmN0aW9uKCkge1xuICAgICAgb2JzZXJ2ZUhhbmRsZS5zdG9wKCk7XG4gICAgfSk7XG5cbiAgICAvLyByZXR1cm4gdGhlIG9ic2VydmVIYW5kbGUgaW4gY2FzZSBpdCBuZWVkcyB0byBiZSBzdG9wcGVkIGVhcmx5XG4gICAgcmV0dXJuIG9ic2VydmVIYW5kbGU7XG4gIH0sXG5cbiAgLy8gcHJvdGVjdCBhZ2FpbnN0IGRhbmdlcm91cyBzZWxlY3RvcnMuICBmYWxzZXkgYW5kIHtfaWQ6IGZhbHNleX0gYXJlIGJvdGhcbiAgLy8gbGlrZWx5IHByb2dyYW1tZXIgZXJyb3IsIGFuZCBub3Qgd2hhdCB5b3Ugd2FudCwgcGFydGljdWxhcmx5IGZvciBkZXN0cnVjdGl2ZVxuICAvLyBvcGVyYXRpb25zLiBJZiBhIGZhbHNleSBfaWQgaXMgc2VudCBpbiwgYSBuZXcgc3RyaW5nIF9pZCB3aWxsIGJlXG4gIC8vIGdlbmVyYXRlZCBhbmQgcmV0dXJuZWQ7IGlmIGEgZmFsbGJhY2tJZCBpcyBwcm92aWRlZCwgaXQgd2lsbCBiZSByZXR1cm5lZFxuICAvLyBpbnN0ZWFkLlxuICBfcmV3cml0ZVNlbGVjdG9yKHNlbGVjdG9yLCB7IGZhbGxiYWNrSWQgfSA9IHt9KSB7XG4gICAgLy8gc2hvcnRoYW5kIC0tIHNjYWxhcnMgbWF0Y2ggX2lkXG4gICAgaWYgKExvY2FsQ29sbGVjdGlvbi5fc2VsZWN0b3JJc0lkKHNlbGVjdG9yKSkgc2VsZWN0b3IgPSB7IF9pZDogc2VsZWN0b3IgfTtcblxuICAgIGlmIChBcnJheS5pc0FycmF5KHNlbGVjdG9yKSkge1xuICAgICAgLy8gVGhpcyBpcyBjb25zaXN0ZW50IHdpdGggdGhlIE1vbmdvIGNvbnNvbGUgaXRzZWxmOyBpZiB3ZSBkb24ndCBkbyB0aGlzXG4gICAgICAvLyBjaGVjayBwYXNzaW5nIGFuIGVtcHR5IGFycmF5IGVuZHMgdXAgc2VsZWN0aW5nIGFsbCBpdGVtc1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTW9uZ28gc2VsZWN0b3IgY2FuJ3QgYmUgYW4gYXJyYXkuXCIpO1xuICAgIH1cblxuICAgIGlmICghc2VsZWN0b3IgfHwgKCdfaWQnIGluIHNlbGVjdG9yICYmICFzZWxlY3Rvci5faWQpKSB7XG4gICAgICAvLyBjYW4ndCBtYXRjaCBhbnl0aGluZ1xuICAgICAgcmV0dXJuIHsgX2lkOiBmYWxsYmFja0lkIHx8IFJhbmRvbS5pZCgpIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHNlbGVjdG9yO1xuICB9LFxufSk7XG5cbk9iamVjdC5hc3NpZ24oTW9uZ28uQ29sbGVjdGlvbi5wcm90b3R5cGUsIHtcbiAgLy8gJ2luc2VydCcgaW1tZWRpYXRlbHkgcmV0dXJucyB0aGUgaW5zZXJ0ZWQgZG9jdW1lbnQncyBuZXcgX2lkLlxuICAvLyBUaGUgb3RoZXJzIHJldHVybiB2YWx1ZXMgaW1tZWRpYXRlbHkgaWYgeW91IGFyZSBpbiBhIHN0dWIsIGFuIGluLW1lbW9yeVxuICAvLyB1bm1hbmFnZWQgY29sbGVjdGlvbiwgb3IgYSBtb25nby1iYWNrZWQgY29sbGVjdGlvbiBhbmQgeW91IGRvbid0IHBhc3MgYVxuICAvLyBjYWxsYmFjay4gJ3VwZGF0ZScgYW5kICdyZW1vdmUnIHJldHVybiB0aGUgbnVtYmVyIG9mIGFmZmVjdGVkXG4gIC8vIGRvY3VtZW50cy4gJ3Vwc2VydCcgcmV0dXJucyBhbiBvYmplY3Qgd2l0aCBrZXlzICdudW1iZXJBZmZlY3RlZCcgYW5kLCBpZiBhblxuICAvLyBpbnNlcnQgaGFwcGVuZWQsICdpbnNlcnRlZElkJy5cbiAgLy9cbiAgLy8gT3RoZXJ3aXNlLCB0aGUgc2VtYW50aWNzIGFyZSBleGFjdGx5IGxpa2Ugb3RoZXIgbWV0aG9kczogdGhleSB0YWtlXG4gIC8vIGEgY2FsbGJhY2sgYXMgYW4gb3B0aW9uYWwgbGFzdCBhcmd1bWVudDsgaWYgbm8gY2FsbGJhY2sgaXNcbiAgLy8gcHJvdmlkZWQsIHRoZXkgYmxvY2sgdW50aWwgdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZSwgYW5kIHRocm93IGFuXG4gIC8vIGV4Y2VwdGlvbiBpZiBpdCBmYWlsczsgaWYgYSBjYWxsYmFjayBpcyBwcm92aWRlZCwgdGhlbiB0aGV5IGRvbid0XG4gIC8vIG5lY2Vzc2FyaWx5IGJsb2NrLCBhbmQgdGhleSBjYWxsIHRoZSBjYWxsYmFjayB3aGVuIHRoZXkgZmluaXNoIHdpdGggZXJyb3IgYW5kXG4gIC8vIHJlc3VsdCBhcmd1bWVudHMuICAoVGhlIGluc2VydCBtZXRob2QgcHJvdmlkZXMgdGhlIGRvY3VtZW50IElEIGFzIGl0cyByZXN1bHQ7XG4gIC8vIHVwZGF0ZSBhbmQgcmVtb3ZlIHByb3ZpZGUgdGhlIG51bWJlciBvZiBhZmZlY3RlZCBkb2NzIGFzIHRoZSByZXN1bHQ7IHVwc2VydFxuICAvLyBwcm92aWRlcyBhbiBvYmplY3Qgd2l0aCBudW1iZXJBZmZlY3RlZCBhbmQgbWF5YmUgaW5zZXJ0ZWRJZC4pXG4gIC8vXG4gIC8vIE9uIHRoZSBjbGllbnQsIGJsb2NraW5nIGlzIGltcG9zc2libGUsIHNvIGlmIGEgY2FsbGJhY2tcbiAgLy8gaXNuJ3QgcHJvdmlkZWQsIHRoZXkganVzdCByZXR1cm4gaW1tZWRpYXRlbHkgYW5kIGFueSBlcnJvclxuICAvLyBpbmZvcm1hdGlvbiBpcyBsb3N0LlxuICAvL1xuICAvLyBUaGVyZSdzIG9uZSBtb3JlIHR3ZWFrLiBPbiB0aGUgY2xpZW50LCBpZiB5b3UgZG9uJ3QgcHJvdmlkZSBhXG4gIC8vIGNhbGxiYWNrLCB0aGVuIGlmIHRoZXJlIGlzIGFuIGVycm9yLCBhIG1lc3NhZ2Ugd2lsbCBiZSBsb2dnZWQgd2l0aFxuICAvLyBNZXRlb3IuX2RlYnVnLlxuICAvL1xuICAvLyBUaGUgaW50ZW50ICh0aG91Z2ggdGhpcyBpcyBhY3R1YWxseSBkZXRlcm1pbmVkIGJ5IHRoZSB1bmRlcmx5aW5nXG4gIC8vIGRyaXZlcnMpIGlzIHRoYXQgdGhlIG9wZXJhdGlvbnMgc2hvdWxkIGJlIGRvbmUgc3luY2hyb25vdXNseSwgbm90XG4gIC8vIGdlbmVyYXRpbmcgdGhlaXIgcmVzdWx0IHVudGlsIHRoZSBkYXRhYmFzZSBoYXMgYWNrbm93bGVkZ2VkXG4gIC8vIHRoZW0uIEluIHRoZSBmdXR1cmUgbWF5YmUgd2Ugc2hvdWxkIHByb3ZpZGUgYSBmbGFnIHRvIHR1cm4gdGhpc1xuICAvLyBvZmYuXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEluc2VydCBhIGRvY3VtZW50IGluIHRoZSBjb2xsZWN0aW9uLiAgUmV0dXJucyBpdHMgdW5pcXVlIF9pZC5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgIGluc2VydFxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICogQHBhcmFtIHtPYmplY3R9IGRvYyBUaGUgZG9jdW1lbnQgdG8gaW5zZXJ0LiBNYXkgbm90IHlldCBoYXZlIGFuIF9pZCBhdHRyaWJ1dGUsIGluIHdoaWNoIGNhc2UgTWV0ZW9yIHdpbGwgZ2VuZXJhdGUgb25lIGZvciB5b3UuXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gT3B0aW9uYWwuICBJZiBwcmVzZW50LCBjYWxsZWQgd2l0aCBhbiBlcnJvciBvYmplY3QgYXMgdGhlIGZpcnN0IGFyZ3VtZW50IGFuZCwgaWYgbm8gZXJyb3IsIHRoZSBfaWQgYXMgdGhlIHNlY29uZC5cbiAgICovXG4gIGluc2VydChkb2MsIGNhbGxiYWNrKSB7XG4gICAgLy8gTWFrZSBzdXJlIHdlIHdlcmUgcGFzc2VkIGEgZG9jdW1lbnQgdG8gaW5zZXJ0XG4gICAgaWYgKCFkb2MpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignaW5zZXJ0IHJlcXVpcmVzIGFuIGFyZ3VtZW50Jyk7XG4gICAgfVxuXG4gICAgLy8gW0ZJQkVSU11cbiAgICAvLyBUT0RPOiBSZW1vdmUgdGhpcyB3aGVuIDMuMCBpcyByZWxlYXNlZC5cbiAgICB3YXJuVXNpbmdPbGRBcGkoXG4gICAgICBcImluc2VydFwiLFxuICAgICAgdGhpcy5fbmFtZSxcbiAgICAgIHRoaXMuaW5zZXJ0LmlzQ2FsbGVkRnJvbUFzeW5jXG4gICAgKTtcbiAgICB0aGlzLmluc2VydC5pc0NhbGxlZEZyb21Bc3luYyA9IGZhbHNlO1xuXG4gICAgLy8gTWFrZSBhIHNoYWxsb3cgY2xvbmUgb2YgdGhlIGRvY3VtZW50LCBwcmVzZXJ2aW5nIGl0cyBwcm90b3R5cGUuXG4gICAgZG9jID0gT2JqZWN0LmNyZWF0ZShcbiAgICAgIE9iamVjdC5nZXRQcm90b3R5cGVPZihkb2MpLFxuICAgICAgT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcnMoZG9jKVxuICAgICk7XG5cbiAgICBpZiAoJ19pZCcgaW4gZG9jKSB7XG4gICAgICBpZiAoXG4gICAgICAgICFkb2MuX2lkIHx8XG4gICAgICAgICEodHlwZW9mIGRvYy5faWQgPT09ICdzdHJpbmcnIHx8IGRvYy5faWQgaW5zdGFuY2VvZiBNb25nby5PYmplY3RJRClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgJ01ldGVvciByZXF1aXJlcyBkb2N1bWVudCBfaWQgZmllbGRzIHRvIGJlIG5vbi1lbXB0eSBzdHJpbmdzIG9yIE9iamVjdElEcydcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgbGV0IGdlbmVyYXRlSWQgPSB0cnVlO1xuXG4gICAgICAvLyBEb24ndCBnZW5lcmF0ZSB0aGUgaWQgaWYgd2UncmUgdGhlIGNsaWVudCBhbmQgdGhlICdvdXRlcm1vc3QnIGNhbGxcbiAgICAgIC8vIFRoaXMgb3B0aW1pemF0aW9uIHNhdmVzIHVzIHBhc3NpbmcgYm90aCB0aGUgcmFuZG9tU2VlZCBhbmQgdGhlIGlkXG4gICAgICAvLyBQYXNzaW5nIGJvdGggaXMgcmVkdW5kYW50LlxuICAgICAgaWYgKHRoaXMuX2lzUmVtb3RlQ29sbGVjdGlvbigpKSB7XG4gICAgICAgIGNvbnN0IGVuY2xvc2luZyA9IEREUC5fQ3VycmVudE1ldGhvZEludm9jYXRpb24uZ2V0KCk7XG4gICAgICAgIGlmICghZW5jbG9zaW5nKSB7XG4gICAgICAgICAgZ2VuZXJhdGVJZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChnZW5lcmF0ZUlkKSB7XG4gICAgICAgIGRvYy5faWQgPSB0aGlzLl9tYWtlTmV3SUQoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBPbiBpbnNlcnRzLCBhbHdheXMgcmV0dXJuIHRoZSBpZCB0aGF0IHdlIGdlbmVyYXRlZDsgb24gYWxsIG90aGVyXG4gICAgLy8gb3BlcmF0aW9ucywganVzdCByZXR1cm4gdGhlIHJlc3VsdCBmcm9tIHRoZSBjb2xsZWN0aW9uLlxuICAgIHZhciBjaG9vc2VSZXR1cm5WYWx1ZUZyb21Db2xsZWN0aW9uUmVzdWx0ID0gZnVuY3Rpb24ocmVzdWx0KSB7XG4gICAgICBpZiAoZG9jLl9pZCkge1xuICAgICAgICByZXR1cm4gZG9jLl9pZDtcbiAgICAgIH1cblxuICAgICAgLy8gWFhYIHdoYXQgaXMgdGhpcyBmb3I/P1xuICAgICAgLy8gSXQncyBzb21lIGl0ZXJhY3Rpb24gYmV0d2VlbiB0aGUgY2FsbGJhY2sgdG8gX2NhbGxNdXRhdG9yTWV0aG9kIGFuZFxuICAgICAgLy8gdGhlIHJldHVybiB2YWx1ZSBjb252ZXJzaW9uXG4gICAgICBkb2MuX2lkID0gcmVzdWx0O1xuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG5cbiAgICBjb25zdCB3cmFwcGVkQ2FsbGJhY2sgPSB3cmFwQ2FsbGJhY2soXG4gICAgICBjYWxsYmFjayxcbiAgICAgIGNob29zZVJldHVyblZhbHVlRnJvbUNvbGxlY3Rpb25SZXN1bHRcbiAgICApO1xuXG4gICAgaWYgKHRoaXMuX2lzUmVtb3RlQ29sbGVjdGlvbigpKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9jYWxsTXV0YXRvck1ldGhvZCgnaW5zZXJ0JywgW2RvY10sIHdyYXBwZWRDYWxsYmFjayk7XG4gICAgICByZXR1cm4gY2hvb3NlUmV0dXJuVmFsdWVGcm9tQ29sbGVjdGlvblJlc3VsdChyZXN1bHQpO1xuICAgIH1cblxuICAgIC8vIGl0J3MgbXkgY29sbGVjdGlvbi4gIGRlc2NlbmQgaW50byB0aGUgY29sbGVjdGlvbiBvYmplY3RcbiAgICAvLyBhbmQgcHJvcGFnYXRlIGFueSBleGNlcHRpb24uXG4gICAgdHJ5IHtcbiAgICAgIC8vIElmIHRoZSB1c2VyIHByb3ZpZGVkIGEgY2FsbGJhY2sgYW5kIHRoZSBjb2xsZWN0aW9uIGltcGxlbWVudHMgdGhpc1xuICAgICAgLy8gb3BlcmF0aW9uIGFzeW5jaHJvbm91c2x5LCB0aGVuIHF1ZXJ5UmV0IHdpbGwgYmUgdW5kZWZpbmVkLCBhbmQgdGhlXG4gICAgICAvLyByZXN1bHQgd2lsbCBiZSByZXR1cm5lZCB0aHJvdWdoIHRoZSBjYWxsYmFjayBpbnN0ZWFkLlxuICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fY29sbGVjdGlvbi5pbnNlcnQoZG9jLCB3cmFwcGVkQ2FsbGJhY2spO1xuICAgICAgcmV0dXJuIGNob29zZVJldHVyblZhbHVlRnJvbUNvbGxlY3Rpb25SZXN1bHQocmVzdWx0KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2soZSk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IE1vZGlmeSBvbmUgb3IgbW9yZSBkb2N1bWVudHMgaW4gdGhlIGNvbGxlY3Rpb24uIFJldHVybnMgdGhlIG51bWJlciBvZiBtYXRjaGVkIGRvY3VtZW50cy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgdXBkYXRlXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IHNlbGVjdG9yIFNwZWNpZmllcyB3aGljaCBkb2N1bWVudHMgdG8gbW9kaWZ5XG4gICAqIEBwYXJhbSB7TW9uZ29Nb2RpZmllcn0gbW9kaWZpZXIgU3BlY2lmaWVzIGhvdyB0byBtb2RpZnkgdGhlIGRvY3VtZW50c1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5tdWx0aSBUcnVlIHRvIG1vZGlmeSBhbGwgbWF0Y2hpbmcgZG9jdW1lbnRzOyBmYWxzZSB0byBvbmx5IG1vZGlmeSBvbmUgb2YgdGhlIG1hdGNoaW5nIGRvY3VtZW50cyAodGhlIGRlZmF1bHQpLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMudXBzZXJ0IFRydWUgdG8gaW5zZXJ0IGEgZG9jdW1lbnQgaWYgbm8gbWF0Y2hpbmcgZG9jdW1lbnRzIGFyZSBmb3VuZC5cbiAgICogQHBhcmFtIHtBcnJheX0gb3B0aW9ucy5hcnJheUZpbHRlcnMgT3B0aW9uYWwuIFVzZWQgaW4gY29tYmluYXRpb24gd2l0aCBNb25nb0RCIFtmaWx0ZXJlZCBwb3NpdGlvbmFsIG9wZXJhdG9yXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9vcGVyYXRvci91cGRhdGUvcG9zaXRpb25hbC1maWx0ZXJlZC8pIHRvIHNwZWNpZnkgd2hpY2ggZWxlbWVudHMgdG8gbW9kaWZ5IGluIGFuIGFycmF5IGZpZWxkLlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2tdIE9wdGlvbmFsLiAgSWYgcHJlc2VudCwgY2FsbGVkIHdpdGggYW4gZXJyb3Igb2JqZWN0IGFzIHRoZSBmaXJzdCBhcmd1bWVudCBhbmQsIGlmIG5vIGVycm9yLCB0aGUgbnVtYmVyIG9mIGFmZmVjdGVkIGRvY3VtZW50cyBhcyB0aGUgc2Vjb25kLlxuICAgKi9cbiAgdXBkYXRlKHNlbGVjdG9yLCBtb2RpZmllciwgLi4ub3B0aW9uc0FuZENhbGxiYWNrKSB7XG4gICAgY29uc3QgY2FsbGJhY2sgPSBwb3BDYWxsYmFja0Zyb21BcmdzKG9wdGlvbnNBbmRDYWxsYmFjayk7XG5cbiAgICAvLyBXZSd2ZSBhbHJlYWR5IHBvcHBlZCBvZmYgdGhlIGNhbGxiYWNrLCBzbyB3ZSBhcmUgbGVmdCB3aXRoIGFuIGFycmF5XG4gICAgLy8gb2Ygb25lIG9yIHplcm8gaXRlbXNcbiAgICBjb25zdCBvcHRpb25zID0geyAuLi4ob3B0aW9uc0FuZENhbGxiYWNrWzBdIHx8IG51bGwpIH07XG4gICAgbGV0IGluc2VydGVkSWQ7XG4gICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy51cHNlcnQpIHtcbiAgICAgIC8vIHNldCBgaW5zZXJ0ZWRJZGAgaWYgYWJzZW50LiAgYGluc2VydGVkSWRgIGlzIGEgTWV0ZW9yIGV4dGVuc2lvbi5cbiAgICAgIGlmIChvcHRpb25zLmluc2VydGVkSWQpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICEoXG4gICAgICAgICAgICB0eXBlb2Ygb3B0aW9ucy5pbnNlcnRlZElkID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgICAgb3B0aW9ucy5pbnNlcnRlZElkIGluc3RhbmNlb2YgTW9uZ28uT2JqZWN0SURcbiAgICAgICAgICApXG4gICAgICAgIClcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2luc2VydGVkSWQgbXVzdCBiZSBzdHJpbmcgb3IgT2JqZWN0SUQnKTtcbiAgICAgICAgaW5zZXJ0ZWRJZCA9IG9wdGlvbnMuaW5zZXJ0ZWRJZDtcbiAgICAgIH0gZWxzZSBpZiAoIXNlbGVjdG9yIHx8ICFzZWxlY3Rvci5faWQpIHtcbiAgICAgICAgaW5zZXJ0ZWRJZCA9IHRoaXMuX21ha2VOZXdJRCgpO1xuICAgICAgICBvcHRpb25zLmdlbmVyYXRlZElkID0gdHJ1ZTtcbiAgICAgICAgb3B0aW9ucy5pbnNlcnRlZElkID0gaW5zZXJ0ZWRJZDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBbRklCRVJTXVxuICAgIC8vIFRPRE86IFJlbW92ZSB0aGlzIHdoZW4gMy4wIGlzIHJlbGVhc2VkLlxuICAgIHdhcm5Vc2luZ09sZEFwaShcbiAgICAgIFwidXBkYXRlXCIsXG4gICAgICB0aGlzLl9uYW1lLFxuICAgICAgdGhpcy51cGRhdGUuaXNDYWxsZWRGcm9tQXN5bmNcbiAgICApO1xuICAgIHRoaXMudXBkYXRlLmlzQ2FsbGVkRnJvbUFzeW5jID0gZmFsc2U7XG5cbiAgICBzZWxlY3RvciA9IE1vbmdvLkNvbGxlY3Rpb24uX3Jld3JpdGVTZWxlY3RvcihzZWxlY3Rvciwge1xuICAgICAgZmFsbGJhY2tJZDogaW5zZXJ0ZWRJZCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHdyYXBwZWRDYWxsYmFjayA9IHdyYXBDYWxsYmFjayhjYWxsYmFjayk7XG5cbiAgICBpZiAodGhpcy5faXNSZW1vdGVDb2xsZWN0aW9uKCkpIHtcbiAgICAgIGNvbnN0IGFyZ3MgPSBbc2VsZWN0b3IsIG1vZGlmaWVyLCBvcHRpb25zXTtcblxuICAgICAgcmV0dXJuIHRoaXMuX2NhbGxNdXRhdG9yTWV0aG9kKCd1cGRhdGUnLCBhcmdzLCB3cmFwcGVkQ2FsbGJhY2spO1xuICAgIH1cblxuICAgIC8vIGl0J3MgbXkgY29sbGVjdGlvbi4gIGRlc2NlbmQgaW50byB0aGUgY29sbGVjdGlvbiBvYmplY3RcbiAgICAvLyBhbmQgcHJvcGFnYXRlIGFueSBleGNlcHRpb24uXG4gICAgdHJ5IHtcbiAgICAgIC8vIElmIHRoZSB1c2VyIHByb3ZpZGVkIGEgY2FsbGJhY2sgYW5kIHRoZSBjb2xsZWN0aW9uIGltcGxlbWVudHMgdGhpc1xuICAgICAgLy8gb3BlcmF0aW9uIGFzeW5jaHJvbm91c2x5LCB0aGVuIHF1ZXJ5UmV0IHdpbGwgYmUgdW5kZWZpbmVkLCBhbmQgdGhlXG4gICAgICAvLyByZXN1bHQgd2lsbCBiZSByZXR1cm5lZCB0aHJvdWdoIHRoZSBjYWxsYmFjayBpbnN0ZWFkLlxuICAgICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24udXBkYXRlKFxuICAgICAgICBzZWxlY3RvcixcbiAgICAgICAgbW9kaWZpZXIsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHdyYXBwZWRDYWxsYmFja1xuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2soZSk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFJlbW92ZSBkb2N1bWVudHMgZnJvbSB0aGUgY29sbGVjdGlvblxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQG1ldGhvZCByZW1vdmVcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7TW9uZ29TZWxlY3Rvcn0gc2VsZWN0b3IgU3BlY2lmaWVzIHdoaWNoIGRvY3VtZW50cyB0byByZW1vdmVcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrXSBPcHRpb25hbC4gIElmIHByZXNlbnQsIGNhbGxlZCB3aXRoIGFuIGVycm9yIG9iamVjdCBhcyBpdHMgYXJndW1lbnQuXG4gICAqL1xuICByZW1vdmUoc2VsZWN0b3IsIGNhbGxiYWNrKSB7XG4gICAgc2VsZWN0b3IgPSBNb25nby5Db2xsZWN0aW9uLl9yZXdyaXRlU2VsZWN0b3Ioc2VsZWN0b3IpO1xuXG4gICAgY29uc3Qgd3JhcHBlZENhbGxiYWNrID0gd3JhcENhbGxiYWNrKGNhbGxiYWNrKTtcblxuICAgIGlmICh0aGlzLl9pc1JlbW90ZUNvbGxlY3Rpb24oKSkge1xuICAgICAgcmV0dXJuIHRoaXMuX2NhbGxNdXRhdG9yTWV0aG9kKCdyZW1vdmUnLCBbc2VsZWN0b3JdLCB3cmFwcGVkQ2FsbGJhY2spO1xuICAgIH1cblxuICAgIC8vIFtGSUJFUlNdXG4gICAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgd2hlbiAzLjAgaXMgcmVsZWFzZWQuXG4gICAgd2FyblVzaW5nT2xkQXBpKFxuICAgICAgXCJyZW1vdmVcIixcbiAgICAgIHRoaXMuX25hbWUsXG4gICAgICB0aGlzLnJlbW92ZS5pc0NhbGxlZEZyb21Bc3luY1xuICAgICk7XG4gICAgdGhpcy5yZW1vdmUuaXNDYWxsZWRGcm9tQXN5bmMgPSBmYWxzZTtcbiAgICAvLyBpdCdzIG15IGNvbGxlY3Rpb24uICBkZXNjZW5kIGludG8gdGhlIGNvbGxlY3Rpb24gb2JqZWN0XG4gICAgLy8gYW5kIHByb3BhZ2F0ZSBhbnkgZXhjZXB0aW9uLlxuICAgIHRyeSB7XG4gICAgICAvLyBJZiB0aGUgdXNlciBwcm92aWRlZCBhIGNhbGxiYWNrIGFuZCB0aGUgY29sbGVjdGlvbiBpbXBsZW1lbnRzIHRoaXNcbiAgICAgIC8vIG9wZXJhdGlvbiBhc3luY2hyb25vdXNseSwgdGhlbiBxdWVyeVJldCB3aWxsIGJlIHVuZGVmaW5lZCwgYW5kIHRoZVxuICAgICAgLy8gcmVzdWx0IHdpbGwgYmUgcmV0dXJuZWQgdGhyb3VnaCB0aGUgY2FsbGJhY2sgaW5zdGVhZC5cbiAgICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnJlbW92ZShzZWxlY3Rvciwgd3JhcHBlZENhbGxiYWNrKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2soZSk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gRGV0ZXJtaW5lIGlmIHRoaXMgY29sbGVjdGlvbiBpcyBzaW1wbHkgYSBtaW5pbW9uZ28gcmVwcmVzZW50YXRpb24gb2YgYSByZWFsXG4gIC8vIGRhdGFiYXNlIG9uIGFub3RoZXIgc2VydmVyXG4gIF9pc1JlbW90ZUNvbGxlY3Rpb24oKSB7XG4gICAgLy8gWFhYIHNlZSAjTWV0ZW9yU2VydmVyTnVsbFxuICAgIHJldHVybiB0aGlzLl9jb25uZWN0aW9uICYmIHRoaXMuX2Nvbm5lY3Rpb24gIT09IE1ldGVvci5zZXJ2ZXI7XG4gIH0sXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IE1vZGlmeSBvbmUgb3IgbW9yZSBkb2N1bWVudHMgaW4gdGhlIGNvbGxlY3Rpb24sIG9yIGluc2VydCBvbmUgaWYgbm8gbWF0Y2hpbmcgZG9jdW1lbnRzIHdlcmUgZm91bmQuIFJldHVybnMgYW4gb2JqZWN0IHdpdGgga2V5cyBgbnVtYmVyQWZmZWN0ZWRgICh0aGUgbnVtYmVyIG9mIGRvY3VtZW50cyBtb2RpZmllZCkgIGFuZCBgaW5zZXJ0ZWRJZGAgKHRoZSB1bmlxdWUgX2lkIG9mIHRoZSBkb2N1bWVudCB0aGF0IHdhcyBpbnNlcnRlZCwgaWYgYW55KS5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBtZXRob2QgdXBzZXJ0XG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKiBAcGFyYW0ge01vbmdvU2VsZWN0b3J9IHNlbGVjdG9yIFNwZWNpZmllcyB3aGljaCBkb2N1bWVudHMgdG8gbW9kaWZ5XG4gICAqIEBwYXJhbSB7TW9uZ29Nb2RpZmllcn0gbW9kaWZpZXIgU3BlY2lmaWVzIGhvdyB0byBtb2RpZnkgdGhlIGRvY3VtZW50c1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5tdWx0aSBUcnVlIHRvIG1vZGlmeSBhbGwgbWF0Y2hpbmcgZG9jdW1lbnRzOyBmYWxzZSB0byBvbmx5IG1vZGlmeSBvbmUgb2YgdGhlIG1hdGNoaW5nIGRvY3VtZW50cyAodGhlIGRlZmF1bHQpLlxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2tdIE9wdGlvbmFsLiAgSWYgcHJlc2VudCwgY2FsbGVkIHdpdGggYW4gZXJyb3Igb2JqZWN0IGFzIHRoZSBmaXJzdCBhcmd1bWVudCBhbmQsIGlmIG5vIGVycm9yLCB0aGUgbnVtYmVyIG9mIGFmZmVjdGVkIGRvY3VtZW50cyBhcyB0aGUgc2Vjb25kLlxuICAgKi9cbiAgdXBzZXJ0KHNlbGVjdG9yLCBtb2RpZmllciwgb3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICBpZiAoIWNhbGxiYWNrICYmIHR5cGVvZiBvcHRpb25zID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjYWxsYmFjayA9IG9wdGlvbnM7XG4gICAgICBvcHRpb25zID0ge307XG4gICAgfVxuXG4gICAgLy8gW0ZJQkVSU11cbiAgICAvLyBUT0RPOiBSZW1vdmUgdGhpcyB3aGVuIDMuMCBpcyByZWxlYXNlZC5cbiAgICB3YXJuVXNpbmdPbGRBcGkoXG4gICAgICBcInVwc2VydFwiLFxuICAgICAgdGhpcy5fbmFtZSxcbiAgICAgIHRoaXMudXBzZXJ0LmlzQ2FsbGVkRnJvbUFzeW5jXG4gICAgKTtcbiAgICB0aGlzLnVwc2VydC5pc0NhbGxlZEZyb21Bc3luYyA9IGZhbHNlOyAvLyB3aWxsIG5vdCB0cmlnZ2VyIHdhcm5pbmcgaW4gYHVwZGF0ZWBcblxuICAgIHJldHVybiB0aGlzLnVwZGF0ZShcbiAgICAgIHNlbGVjdG9yLFxuICAgICAgbW9kaWZpZXIsXG4gICAgICB7XG4gICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgIF9yZXR1cm5PYmplY3Q6IHRydWUsXG4gICAgICAgIHVwc2VydDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBjYWxsYmFja1xuICAgICk7XG4gIH0sXG5cbiAgLy8gV2UnbGwgYWN0dWFsbHkgZGVzaWduIGFuIGluZGV4IEFQSSBsYXRlci4gRm9yIG5vdywgd2UganVzdCBwYXNzIHRocm91Z2ggdG9cbiAgLy8gTW9uZ28ncywgYnV0IG1ha2UgaXQgc3luY2hyb25vdXMuXG4gIF9lbnN1cmVJbmRleChpbmRleCwgb3B0aW9ucykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXNlbGYuX2NvbGxlY3Rpb24uX2Vuc3VyZUluZGV4IHx8ICFzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUluZGV4KVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW4gb25seSBjYWxsIGNyZWF0ZUluZGV4IG9uIHNlcnZlciBjb2xsZWN0aW9ucycpO1xuICAgIGlmIChzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUluZGV4KSB7XG4gICAgICBzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4LCBvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaW1wb3J0IHsgTG9nIH0gZnJvbSAnbWV0ZW9yL2xvZ2dpbmcnO1xuICAgICAgTG9nLmRlYnVnKGBfZW5zdXJlSW5kZXggaGFzIGJlZW4gZGVwcmVjYXRlZCwgcGxlYXNlIHVzZSB0aGUgbmV3ICdjcmVhdGVJbmRleCcgaW5zdGVhZCR7b3B0aW9ucz8ubmFtZSA/IGAsIGluZGV4IG5hbWU6ICR7b3B0aW9ucy5uYW1lfWAgOiBgLCBpbmRleDogJHtKU09OLnN0cmluZ2lmeShpbmRleCl9YH1gKVxuICAgICAgc2VsZi5fY29sbGVjdGlvbi5fZW5zdXJlSW5kZXgoaW5kZXgsIG9wdGlvbnMpO1xuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgQ3JlYXRlcyB0aGUgc3BlY2lmaWVkIGluZGV4IG9uIHRoZSBjb2xsZWN0aW9uLlxuICAgKiBAbG9jdXMgc2VydmVyXG4gICAqIEBtZXRob2QgY3JlYXRlSW5kZXhcbiAgICogQG1lbWJlcm9mIE1vbmdvLkNvbGxlY3Rpb25cbiAgICogQGluc3RhbmNlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBpbmRleCBBIGRvY3VtZW50IHRoYXQgY29udGFpbnMgdGhlIGZpZWxkIGFuZCB2YWx1ZSBwYWlycyB3aGVyZSB0aGUgZmllbGQgaXMgdGhlIGluZGV4IGtleSBhbmQgdGhlIHZhbHVlIGRlc2NyaWJlcyB0aGUgdHlwZSBvZiBpbmRleCBmb3IgdGhhdCBmaWVsZC4gRm9yIGFuIGFzY2VuZGluZyBpbmRleCBvbiBhIGZpZWxkLCBzcGVjaWZ5IGEgdmFsdWUgb2YgYDFgOyBmb3IgZGVzY2VuZGluZyBpbmRleCwgc3BlY2lmeSBhIHZhbHVlIG9mIGAtMWAuIFVzZSBgdGV4dGAgZm9yIHRleHQgaW5kZXhlcy5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBBbGwgb3B0aW9ucyBhcmUgbGlzdGVkIGluIFtNb25nb0RCIGRvY3VtZW50YXRpb25dKGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL21ldGhvZC9kYi5jb2xsZWN0aW9uLmNyZWF0ZUluZGV4LyNvcHRpb25zKVxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3B0aW9ucy5uYW1lIE5hbWUgb2YgdGhlIGluZGV4XG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy51bmlxdWUgRGVmaW5lIHRoYXQgdGhlIGluZGV4IHZhbHVlcyBtdXN0IGJlIHVuaXF1ZSwgbW9yZSBhdCBbTW9uZ29EQiBkb2N1bWVudGF0aW9uXShodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtdW5pcXVlLylcbiAgICogQHBhcmFtIHtCb29sZWFufSBvcHRpb25zLnNwYXJzZSBEZWZpbmUgdGhhdCB0aGUgaW5kZXggaXMgc3BhcnNlLCBtb3JlIGF0IFtNb25nb0RCIGRvY3VtZW50YXRpb25dKGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9pbmRleC1zcGFyc2UvKVxuICAgKi9cbiAgY3JlYXRlSW5kZXgoaW5kZXgsIG9wdGlvbnMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKCFzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUluZGV4KVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW4gb25seSBjYWxsIGNyZWF0ZUluZGV4IG9uIHNlcnZlciBjb2xsZWN0aW9ucycpO1xuICAgIC8vIFtGSUJFUlNdXG4gICAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgd2hlbiAzLjAgaXMgcmVsZWFzZWQuXG4gICAgd2FyblVzaW5nT2xkQXBpKFxuICAgICAgXCJjcmVhdGVJbmRleFwiLFxuICAgICAgc2VsZi5fbmFtZSxcbiAgICAgIHNlbGYuY3JlYXRlSW5kZXguaXNDYWxsZWRGcm9tQXN5bmNcbiAgICApO1xuICAgIHNlbGYuY3JlYXRlSW5kZXguaXNDYWxsZWRGcm9tQXN5bmMgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgc2VsZi5fY29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleCwgb3B0aW9ucyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUubWVzc2FnZS5pbmNsdWRlcygnQW4gZXF1aXZhbGVudCBpbmRleCBhbHJlYWR5IGV4aXN0cyB3aXRoIHRoZSBzYW1lIG5hbWUgYnV0IGRpZmZlcmVudCBvcHRpb25zLicpICYmIE1ldGVvci5zZXR0aW5ncz8ucGFja2FnZXM/Lm1vbmdvPy5yZUNyZWF0ZUluZGV4T25PcHRpb25NaXNtYXRjaCkge1xuICAgICAgICBpbXBvcnQgeyBMb2cgfSBmcm9tICdtZXRlb3IvbG9nZ2luZyc7XG5cbiAgICAgICAgTG9nLmluZm8oYFJlLWNyZWF0aW5nIGluZGV4ICR7aW5kZXh9IGZvciAke3NlbGYuX25hbWV9IGR1ZSB0byBvcHRpb25zIG1pc21hdGNoLmApO1xuICAgICAgICBzZWxmLl9jb2xsZWN0aW9uLl9kcm9wSW5kZXgoaW5kZXgpO1xuICAgICAgICBzZWxmLl9jb2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4LCBvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoYEFuIGVycm9yIG9jY3VycmVkIHdoZW4gY3JlYXRpbmcgYW4gaW5kZXggZm9yIGNvbGxlY3Rpb24gXCIke3NlbGYuX25hbWV9OiAke2UubWVzc2FnZX1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgX2Ryb3BJbmRleChpbmRleCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXNlbGYuX2NvbGxlY3Rpb24uX2Ryb3BJbmRleClcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2FuIG9ubHkgY2FsbCBfZHJvcEluZGV4IG9uIHNlcnZlciBjb2xsZWN0aW9ucycpO1xuICAgIHNlbGYuX2NvbGxlY3Rpb24uX2Ryb3BJbmRleChpbmRleCk7XG4gIH0sXG5cbiAgX2Ryb3BDb2xsZWN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoIXNlbGYuX2NvbGxlY3Rpb24uZHJvcENvbGxlY3Rpb24pXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbiBvbmx5IGNhbGwgX2Ryb3BDb2xsZWN0aW9uIG9uIHNlcnZlciBjb2xsZWN0aW9ucycpO1xuICAgIHNlbGYuX2NvbGxlY3Rpb24uZHJvcENvbGxlY3Rpb24oKTtcbiAgfSxcblxuICBfY3JlYXRlQ2FwcGVkQ29sbGVjdGlvbihieXRlU2l6ZSwgbWF4RG9jdW1lbnRzKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghc2VsZi5fY29sbGVjdGlvbi5fY3JlYXRlQ2FwcGVkQ29sbGVjdGlvbilcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ0NhbiBvbmx5IGNhbGwgX2NyZWF0ZUNhcHBlZENvbGxlY3Rpb24gb24gc2VydmVyIGNvbGxlY3Rpb25zJ1xuICAgICAgKTtcbiAgICBcbiAgICAvLyBbRklCRVJTXVxuICAgIC8vIFRPRE86IFJlbW92ZSB0aGlzIHdoZW4gMy4wIGlzIHJlbGVhc2VkLlxuICAgIHdhcm5Vc2luZ09sZEFwaShcbiAgICAgIFwiX2NyZWF0ZUNhcHBlZENvbGxlY3Rpb25cIixcbiAgICAgIHNlbGYuX25hbWUsXG4gICAgICBzZWxmLl9jcmVhdGVDYXBwZWRDb2xsZWN0aW9uLmlzQ2FsbGVkRnJvbUFzeW5jXG4gICAgKTtcbiAgICBzZWxmLl9jcmVhdGVDYXBwZWRDb2xsZWN0aW9uLmlzQ2FsbGVkRnJvbUFzeW5jID0gZmFsc2U7XG4gICAgc2VsZi5fY29sbGVjdGlvbi5fY3JlYXRlQ2FwcGVkQ29sbGVjdGlvbihieXRlU2l6ZSwgbWF4RG9jdW1lbnRzKTtcbiAgfSxcblxuICAvKipcbiAgICogQHN1bW1hcnkgUmV0dXJucyB0aGUgW2BDb2xsZWN0aW9uYF0oaHR0cDovL21vbmdvZGIuZ2l0aHViLmlvL25vZGUtbW9uZ29kYi1uYXRpdmUvMy4wL2FwaS9Db2xsZWN0aW9uLmh0bWwpIG9iamVjdCBjb3JyZXNwb25kaW5nIHRvIHRoaXMgY29sbGVjdGlvbiBmcm9tIHRoZSBbbnBtIGBtb25nb2RiYCBkcml2ZXIgbW9kdWxlXShodHRwczovL3d3dy5ucG1qcy5jb20vcGFja2FnZS9tb25nb2RiKSB3aGljaCBpcyB3cmFwcGVkIGJ5IGBNb25nby5Db2xsZWN0aW9uYC5cbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAbWVtYmVyb2YgTW9uZ28uQ29sbGVjdGlvblxuICAgKiBAaW5zdGFuY2VcbiAgICovXG4gIHJhd0NvbGxlY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghc2VsZi5fY29sbGVjdGlvbi5yYXdDb2xsZWN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbiBvbmx5IGNhbGwgcmF3Q29sbGVjdGlvbiBvbiBzZXJ2ZXIgY29sbGVjdGlvbnMnKTtcbiAgICB9XG4gICAgcmV0dXJuIHNlbGYuX2NvbGxlY3Rpb24ucmF3Q29sbGVjdGlvbigpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBSZXR1cm5zIHRoZSBbYERiYF0oaHR0cDovL21vbmdvZGIuZ2l0aHViLmlvL25vZGUtbW9uZ29kYi1uYXRpdmUvMy4wL2FwaS9EYi5odG1sKSBvYmplY3QgY29ycmVzcG9uZGluZyB0byB0aGlzIGNvbGxlY3Rpb24ncyBkYXRhYmFzZSBjb25uZWN0aW9uIGZyb20gdGhlIFtucG0gYG1vbmdvZGJgIGRyaXZlciBtb2R1bGVdKGh0dHBzOi8vd3d3Lm5wbWpzLmNvbS9wYWNrYWdlL21vbmdvZGIpIHdoaWNoIGlzIHdyYXBwZWQgYnkgYE1vbmdvLkNvbGxlY3Rpb25gLlxuICAgKiBAbG9jdXMgU2VydmVyXG4gICAqIEBtZW1iZXJvZiBNb25nby5Db2xsZWN0aW9uXG4gICAqIEBpbnN0YW5jZVxuICAgKi9cbiAgcmF3RGF0YWJhc2UoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghKHNlbGYuX2RyaXZlci5tb25nbyAmJiBzZWxmLl9kcml2ZXIubW9uZ28uZGIpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbiBvbmx5IGNhbGwgcmF3RGF0YWJhc2Ugb24gc2VydmVyIGNvbGxlY3Rpb25zJyk7XG4gICAgfVxuICAgIHJldHVybiBzZWxmLl9kcml2ZXIubW9uZ28uZGI7XG4gIH0sXG59KTtcblxuLy8gQ29udmVydCB0aGUgY2FsbGJhY2sgdG8gbm90IHJldHVybiBhIHJlc3VsdCBpZiB0aGVyZSBpcyBhbiBlcnJvclxuZnVuY3Rpb24gd3JhcENhbGxiYWNrKGNhbGxiYWNrLCBjb252ZXJ0UmVzdWx0KSB7XG4gIHJldHVybiAoXG4gICAgY2FsbGJhY2sgJiZcbiAgICBmdW5jdGlvbihlcnJvciwgcmVzdWx0KSB7XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgY2FsbGJhY2soZXJyb3IpO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY29udmVydFJlc3VsdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjYWxsYmFjayhlcnJvciwgY29udmVydFJlc3VsdChyZXN1bHQpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCByZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn1cblxuLyoqXG4gKiBAc3VtbWFyeSBDcmVhdGUgYSBNb25nby1zdHlsZSBgT2JqZWN0SURgLiAgSWYgeW91IGRvbid0IHNwZWNpZnkgYSBgaGV4U3RyaW5nYCwgdGhlIGBPYmplY3RJRGAgd2lsbCBnZW5lcmF0ZWQgcmFuZG9tbHkgKG5vdCB1c2luZyBNb25nb0RCJ3MgSUQgY29uc3RydWN0aW9uIHJ1bGVzKS5cbiAqIEBsb2N1cyBBbnl3aGVyZVxuICogQGNsYXNzXG4gKiBAcGFyYW0ge1N0cmluZ30gW2hleFN0cmluZ10gT3B0aW9uYWwuICBUaGUgMjQtY2hhcmFjdGVyIGhleGFkZWNpbWFsIGNvbnRlbnRzIG9mIHRoZSBPYmplY3RJRCB0byBjcmVhdGVcbiAqL1xuTW9uZ28uT2JqZWN0SUQgPSBNb25nb0lELk9iamVjdElEO1xuXG4vKipcbiAqIEBzdW1tYXJ5IFRvIGNyZWF0ZSBhIGN1cnNvciwgdXNlIGZpbmQuIFRvIGFjY2VzcyB0aGUgZG9jdW1lbnRzIGluIGEgY3Vyc29yLCB1c2UgZm9yRWFjaCwgbWFwLCBvciBmZXRjaC5cbiAqIEBjbGFzc1xuICogQGluc3RhbmNlTmFtZSBjdXJzb3JcbiAqL1xuTW9uZ28uQ3Vyc29yID0gTG9jYWxDb2xsZWN0aW9uLkN1cnNvcjtcblxuLyoqXG4gKiBAZGVwcmVjYXRlZCBpbiAwLjkuMVxuICovXG5Nb25nby5Db2xsZWN0aW9uLkN1cnNvciA9IE1vbmdvLkN1cnNvcjtcblxuLyoqXG4gKiBAZGVwcmVjYXRlZCBpbiAwLjkuMVxuICovXG5Nb25nby5Db2xsZWN0aW9uLk9iamVjdElEID0gTW9uZ28uT2JqZWN0SUQ7XG5cbi8qKlxuICogQGRlcHJlY2F0ZWQgaW4gMC45LjFcbiAqL1xuTWV0ZW9yLkNvbGxlY3Rpb24gPSBNb25nby5Db2xsZWN0aW9uO1xuXG4vLyBBbGxvdyBkZW55IHN0dWZmIGlzIG5vdyBpbiB0aGUgYWxsb3ctZGVueSBwYWNrYWdlXG5PYmplY3QuYXNzaWduKE1ldGVvci5Db2xsZWN0aW9uLnByb3RvdHlwZSwgQWxsb3dEZW55LkNvbGxlY3Rpb25Qcm90b3R5cGUpO1xuXG5mdW5jdGlvbiBwb3BDYWxsYmFja0Zyb21BcmdzKGFyZ3MpIHtcbiAgLy8gUHVsbCBvZmYgYW55IGNhbGxiYWNrIChvciBwZXJoYXBzIGEgJ2NhbGxiYWNrJyB2YXJpYWJsZSB0aGF0IHdhcyBwYXNzZWRcbiAgLy8gaW4gdW5kZWZpbmVkLCBsaWtlIGhvdyAndXBzZXJ0JyBkb2VzIGl0KS5cbiAgaWYgKFxuICAgIGFyZ3MubGVuZ3RoICYmXG4gICAgKGFyZ3NbYXJncy5sZW5ndGggLSAxXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICBhcmdzW2FyZ3MubGVuZ3RoIC0gMV0gaW5zdGFuY2VvZiBGdW5jdGlvbilcbiAgKSB7XG4gICAgcmV0dXJuIGFyZ3MucG9wKCk7XG4gIH1cbn1cblxuXG5BU1lOQ19DT0xMRUNUSU9OX01FVEhPRFMuZm9yRWFjaChtZXRob2ROYW1lID0+IHtcbiAgY29uc3QgbWV0aG9kTmFtZUFzeW5jID0gZ2V0QXN5bmNNZXRob2ROYW1lKG1ldGhvZE5hbWUpO1xuICBNb25nby5Db2xsZWN0aW9uLnByb3RvdHlwZVttZXRob2ROYW1lQXN5bmNdID0gZnVuY3Rpb24oLi4uYXJncykge1xuICAgIHRyeSB7XG4gICAgLy8gVE9ETzogRmliZXJzIHJlbW92ZSB0aGlzIHdoZW4gd2UgcmVtb3ZlIGZpYmVycy5cbiAgICAgIHRoaXNbbWV0aG9kTmFtZV0uaXNDYWxsZWRGcm9tQXN5bmMgPSB0cnVlO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzW21ldGhvZE5hbWVdKC4uLmFyZ3MpKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICB9XG4gIH07XG5cbn0pO1xuIiwiLyoqXG4gKiBAc3VtbWFyeSBBbGxvd3MgZm9yIHVzZXIgc3BlY2lmaWVkIGNvbm5lY3Rpb24gb3B0aW9uc1xuICogQGV4YW1wbGUgaHR0cDovL21vbmdvZGIuZ2l0aHViLmlvL25vZGUtbW9uZ29kYi1uYXRpdmUvMy4wL3JlZmVyZW5jZS9jb25uZWN0aW5nL2Nvbm5lY3Rpb24tc2V0dGluZ3MvXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBVc2VyIHNwZWNpZmllZCBNb25nbyBjb25uZWN0aW9uIG9wdGlvbnNcbiAqL1xuTW9uZ28uc2V0Q29ubmVjdGlvbk9wdGlvbnMgPSBmdW5jdGlvbiBzZXRDb25uZWN0aW9uT3B0aW9ucyAob3B0aW9ucykge1xuICBjaGVjayhvcHRpb25zLCBPYmplY3QpO1xuICBNb25nby5fY29ubmVjdGlvbk9wdGlvbnMgPSBvcHRpb25zO1xufTsiLCJleHBvcnQgY29uc3Qgbm9ybWFsaXplUHJvamVjdGlvbiA9IG9wdGlvbnMgPT4ge1xuICAvLyB0cmFuc2Zvcm0gZmllbGRzIGtleSBpbiBwcm9qZWN0aW9uXG4gIGNvbnN0IHsgZmllbGRzLCBwcm9qZWN0aW9uLCAuLi5vdGhlck9wdGlvbnMgfSA9IG9wdGlvbnMgfHwge307XG4gIC8vIFRPRE86IGVuYWJsZSB0aGlzIGNvbW1lbnQgd2hlbiBkZXByZWNhdGluZyB0aGUgZmllbGRzIG9wdGlvblxuICAvLyBMb2cuZGVidWcoYGZpZWxkcyBvcHRpb24gaGFzIGJlZW4gZGVwcmVjYXRlZCwgcGxlYXNlIHVzZSB0aGUgbmV3ICdwcm9qZWN0aW9uJyBpbnN0ZWFkYClcblxuICByZXR1cm4ge1xuICAgIC4uLm90aGVyT3B0aW9ucyxcbiAgICAuLi4ocHJvamVjdGlvbiB8fCBmaWVsZHMgPyB7IHByb2plY3Rpb246IGZpZWxkcyB8fCBwcm9qZWN0aW9uIH0gOiB7fSksXG4gIH07XG59O1xuIl19
