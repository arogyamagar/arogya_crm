(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var Random = Package.random.Random;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var RateLimiter;

var require = meteorInstall({"node_modules":{"meteor":{"rate-limit":{"rate-limit.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                          //
// packages/rate-limit/rate-limit.js                                                                        //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                            //
module.export({
  RateLimiter: () => RateLimiter
});
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
let Random;
module.link("meteor/random", {
  Random(v) {
    Random = v;
  }
}, 1);
// Default time interval (in milliseconds) to reset rate limit counters
const DEFAULT_INTERVAL_TIME_IN_MILLISECONDS = 1000;
// Default number of events allowed per time interval
const DEFAULT_REQUESTS_PER_INTERVAL = 10;
const hasOwn = Object.prototype.hasOwnProperty;

// A rule is defined by an options object that contains two fields,
// `numRequestsAllowed` which is the number of events allowed per interval, and
// an `intervalTime` which is the amount of time in milliseconds before the
// rate limit restarts its internal counters, and by a matchers object. A
// matchers object is a POJO that contains a set of keys with values that
// define the entire set of inputs that match for each key. The values can
// either be null (optional), a primitive or a function that returns a boolean
// of whether the provided input's value matches for this key.
//
// Rules are uniquely assigned an `id` and they store a dictionary of counters,
// which are records used to keep track of inputs that match the rule. If a
// counter reaches the `numRequestsAllowed` within a given `intervalTime`, a
// rate limit is reached and future inputs that map to that counter will
// result in errors being returned to the client.
class Rule {
  constructor(options, matchers) {
    this.id = Random.id();
    this.options = options;
    this._matchers = matchers;
    this._lastResetTime = new Date().getTime();

    // Dictionary of input keys to counters
    this.counters = {};
  }
  // Determine if this rule applies to the given input by comparing all
  // rule.matchers. If the match fails, search short circuits instead of
  // iterating through all matchers.
  match(input) {
    return Object.entries(this._matchers).every(_ref => {
      let [key, matcher] = _ref;
      if (matcher !== null) {
        if (!hasOwn.call(input, key)) {
          return false;
        } else if (typeof matcher === 'function') {
          if (!matcher(input[key])) {
            return false;
          }
        } else if (matcher !== input[key]) {
          return false;
        }
      }
      return true;
    });
  }

  // Generates unique key string for provided input by concatenating all the
  // keys in the matcher with the corresponding values in the input.
  // Only called if rule matches input.
  _generateKeyString(input) {
    return Object.entries(this._matchers).filter(_ref2 => {
      let [key] = _ref2;
      return this._matchers[key] !== null;
    }).reduce((returnString, _ref3) => {
      let [key, matcher] = _ref3;
      if (typeof matcher === 'function') {
        if (matcher(input[key])) {
          returnString += key + input[key];
        }
      } else {
        returnString += key + input[key];
      }
      return returnString;
    }, '');
  }

  // Applies the provided input and returns the key string, time since counters
  // were last reset and time to next reset.
  apply(input) {
    const key = this._generateKeyString(input);
    const timeSinceLastReset = new Date().getTime() - this._lastResetTime;
    const timeToNextReset = this.options.intervalTime - timeSinceLastReset;
    return {
      key,
      timeSinceLastReset,
      timeToNextReset
    };
  }

  // Reset counter dictionary for this specific rule. Called once the
  // timeSinceLastReset has exceeded the intervalTime. _lastResetTime is
  // set to be the current time in milliseconds.
  resetCounter() {
    // Delete the old counters dictionary to allow for garbage collection
    this.counters = {};
    this._lastResetTime = new Date().getTime();
  }
  _executeCallback(reply, ruleInput) {
    try {
      if (this.options.callback) {
        this.options.callback(reply, ruleInput);
      }
    } catch (e) {
      // Do not throw error here
      console.error(e);
    }
  }
}
class RateLimiter {
  // Initialize rules to be an empty dictionary.
  constructor() {
    // Dictionary of all rules associated with this RateLimiter, keyed by their
    // id. Each rule object stores the rule pattern, number of events allowed,
    // last reset time and the rule reset interval in milliseconds.

    this.rules = {};
  }

  /**
  * Checks if this input has exceeded any rate limits.
  * @param  {object} input dictionary containing key-value pairs of attributes
  * that match to rules
  * @return {object} Returns object of following structure
  * { 'allowed': boolean - is this input allowed
  *   'timeToReset': integer | Infinity - returns time until counters are reset
  *                   in milliseconds
  *   'numInvocationsLeft': integer | Infinity - returns number of calls left
  *   before limit is reached
  * }
  * If multiple rules match, the least number of invocations left is returned.
  * If the rate limit has been reached, the longest timeToReset is returned.
  */
  check(input) {
    const reply = {
      allowed: true,
      timeToReset: 0,
      numInvocationsLeft: Infinity
    };
    const matchedRules = this._findAllMatchingRules(input);
    matchedRules.forEach(rule => {
      const ruleResult = rule.apply(input);
      let numInvocations = rule.counters[ruleResult.key];
      if (ruleResult.timeToNextReset < 0) {
        // Reset all the counters since the rule has reset
        rule.resetCounter();
        ruleResult.timeSinceLastReset = new Date().getTime() - rule._lastResetTime;
        ruleResult.timeToNextReset = rule.options.intervalTime;
        numInvocations = 0;
      }
      if (numInvocations > rule.options.numRequestsAllowed) {
        // Only update timeToReset if the new time would be longer than the
        // previously set time. This is to ensure that if this input triggers
        // multiple rules, we return the longest period of time until they can
        // successfully make another call
        if (reply.timeToReset < ruleResult.timeToNextReset) {
          reply.timeToReset = ruleResult.timeToNextReset;
        }
        reply.allowed = false;
        reply.numInvocationsLeft = 0;
        reply.ruleId = rule.id;
        rule._executeCallback(reply, input);
      } else {
        // If this is an allowed attempt and we haven't failed on any of the
        // other rules that match, update the reply field.
        if (rule.options.numRequestsAllowed - numInvocations < reply.numInvocationsLeft && reply.allowed) {
          reply.timeToReset = ruleResult.timeToNextReset;
          reply.numInvocationsLeft = rule.options.numRequestsAllowed - numInvocations;
        }
        reply.ruleId = rule.id;
        rule._executeCallback(reply, input);
      }
    });
    return reply;
  }

  /**
  * Adds a rule to dictionary of rules that are checked against on every call.
  * Only inputs that pass all of the rules will be allowed. Returns unique rule
  * id that can be passed to `removeRule`.
  * @param {object} rule    Input dictionary defining certain attributes and
  * rules associated with them.
  * Each attribute's value can either be a value, a function or null. All
  * functions must return a boolean of whether the input is matched by that
  * attribute's rule or not
  * @param {integer} numRequestsAllowed Optional. Number of events allowed per
  * interval. Default = 10.
  * @param {integer} intervalTime Optional. Number of milliseconds before
  * rule's counters are reset. Default = 1000.
  * @param {function} callback Optional. Function to be called after a
  * rule is executed. Two objects will be passed to this function.
  * The first one is the result of RateLimiter.prototype.check
  * The second is the input object of the rule, it has the following structure:
  * {
  *   'type': string - either 'method' or 'subscription'
  *   'name': string - the name of the method or subscription being called
  *   'userId': string - the user ID attempting the method or subscription
  *   'connectionId': string - a string representing the user's DDP connection
  *   'clientAddress': string - the IP address of the user
  * }
  * @return {string} Returns unique rule id
  */
  addRule(rule, numRequestsAllowed, intervalTime, callback) {
    const options = {
      numRequestsAllowed: numRequestsAllowed || DEFAULT_REQUESTS_PER_INTERVAL,
      intervalTime: intervalTime || DEFAULT_INTERVAL_TIME_IN_MILLISECONDS,
      callback: callback && Meteor.bindEnvironment(callback)
    };
    const newRule = new Rule(options, rule);
    this.rules[newRule.id] = newRule;
    return newRule.id;
  }

  /**
  * Increment counters in every rule that match to this input
  * @param  {object} input Dictionary object containing attributes that may
  * match to rules
  */
  increment(input) {
    // Only increment rule counters that match this input
    const matchedRules = this._findAllMatchingRules(input);
    matchedRules.forEach(rule => {
      const ruleResult = rule.apply(input);
      if (ruleResult.timeSinceLastReset > rule.options.intervalTime) {
        // Reset all the counters since the rule has reset
        rule.resetCounter();
      }

      // Check whether the key exists, incrementing it if so or otherwise
      // adding the key and setting its value to 1
      if (hasOwn.call(rule.counters, ruleResult.key)) {
        rule.counters[ruleResult.key]++;
      } else {
        rule.counters[ruleResult.key] = 1;
      }
    });
  }

  // Returns an array of all rules that apply to provided input
  _findAllMatchingRules(input) {
    return Object.values(this.rules).filter(rule => rule.match(input));
  }

  /**
   * Provides a mechanism to remove rules from the rate limiter. Returns boolean
   * about success.
   * @param  {string} id Rule id returned from #addRule
   * @return {boolean} Returns true if rule was found and deleted, else false.
   */
  removeRule(id) {
    if (this.rules[id]) {
      delete this.rules[id];
      return true;
    }
    return false;
  }
}
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

var exports = require("/node_modules/meteor/rate-limit/rate-limit.js");

/* Exports */
Package._define("rate-limit", exports, {
  RateLimiter: RateLimiter
});

})();

//# sourceURL=meteor://💻app/packages/rate-limit.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvcmF0ZS1saW1pdC9yYXRlLWxpbWl0LmpzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIlJhdGVMaW1pdGVyIiwiTWV0ZW9yIiwibGluayIsInYiLCJSYW5kb20iLCJERUZBVUxUX0lOVEVSVkFMX1RJTUVfSU5fTUlMTElTRUNPTkRTIiwiREVGQVVMVF9SRVFVRVNUU19QRVJfSU5URVJWQUwiLCJoYXNPd24iLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsIlJ1bGUiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJtYXRjaGVycyIsImlkIiwiX21hdGNoZXJzIiwiX2xhc3RSZXNldFRpbWUiLCJEYXRlIiwiZ2V0VGltZSIsImNvdW50ZXJzIiwibWF0Y2giLCJpbnB1dCIsImVudHJpZXMiLCJldmVyeSIsImtleSIsIm1hdGNoZXIiLCJjYWxsIiwiX2dlbmVyYXRlS2V5U3RyaW5nIiwiZmlsdGVyIiwicmVkdWNlIiwicmV0dXJuU3RyaW5nIiwiYXBwbHkiLCJ0aW1lU2luY2VMYXN0UmVzZXQiLCJ0aW1lVG9OZXh0UmVzZXQiLCJpbnRlcnZhbFRpbWUiLCJyZXNldENvdW50ZXIiLCJfZXhlY3V0ZUNhbGxiYWNrIiwicmVwbHkiLCJydWxlSW5wdXQiLCJjYWxsYmFjayIsImUiLCJjb25zb2xlIiwiZXJyb3IiLCJydWxlcyIsImNoZWNrIiwiYWxsb3dlZCIsInRpbWVUb1Jlc2V0IiwibnVtSW52b2NhdGlvbnNMZWZ0IiwiSW5maW5pdHkiLCJtYXRjaGVkUnVsZXMiLCJfZmluZEFsbE1hdGNoaW5nUnVsZXMiLCJmb3JFYWNoIiwicnVsZSIsInJ1bGVSZXN1bHQiLCJudW1JbnZvY2F0aW9ucyIsIm51bVJlcXVlc3RzQWxsb3dlZCIsInJ1bGVJZCIsImFkZFJ1bGUiLCJiaW5kRW52aXJvbm1lbnQiLCJuZXdSdWxlIiwiaW5jcmVtZW50IiwidmFsdWVzIiwicmVtb3ZlUnVsZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBQSxNQUFNLENBQUNDLE1BQU0sQ0FBQztFQUFDQyxXQUFXLEVBQUMsTUFBSUE7QUFBVyxDQUFDLENBQUM7QUFBQyxJQUFJQyxNQUFNO0FBQUNILE1BQU0sQ0FBQ0ksSUFBSSxDQUFDLGVBQWUsRUFBQztFQUFDRCxNQUFNLENBQUNFLENBQUMsRUFBQztJQUFDRixNQUFNLEdBQUNFLENBQUM7RUFBQTtBQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7QUFBQyxJQUFJQyxNQUFNO0FBQUNOLE1BQU0sQ0FBQ0ksSUFBSSxDQUFDLGVBQWUsRUFBQztFQUFDRSxNQUFNLENBQUNELENBQUMsRUFBQztJQUFDQyxNQUFNLEdBQUNELENBQUM7RUFBQTtBQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7QUFHNUs7QUFDQSxNQUFNRSxxQ0FBcUMsR0FBRyxJQUFJO0FBQ2xEO0FBQ0EsTUFBTUMsNkJBQTZCLEdBQUcsRUFBRTtBQUV4QyxNQUFNQyxNQUFNLEdBQUdDLE1BQU0sQ0FBQ0MsU0FBUyxDQUFDQyxjQUFjOztBQUU5QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUMsSUFBSSxDQUFDO0VBQ1RDLFdBQVcsQ0FBQ0MsT0FBTyxFQUFFQyxRQUFRLEVBQUU7SUFDN0IsSUFBSSxDQUFDQyxFQUFFLEdBQUdYLE1BQU0sQ0FBQ1csRUFBRSxFQUFFO0lBRXJCLElBQUksQ0FBQ0YsT0FBTyxHQUFHQSxPQUFPO0lBRXRCLElBQUksQ0FBQ0csU0FBUyxHQUFHRixRQUFRO0lBRXpCLElBQUksQ0FBQ0csY0FBYyxHQUFHLElBQUlDLElBQUksRUFBRSxDQUFDQyxPQUFPLEVBQUU7O0lBRTFDO0lBQ0EsSUFBSSxDQUFDQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO0VBQ3BCO0VBQ0E7RUFDQTtFQUNBO0VBQ0FDLEtBQUssQ0FBQ0MsS0FBSyxFQUFFO0lBQ1gsT0FBT2QsTUFBTSxDQUNWZSxPQUFPLENBQUMsSUFBSSxDQUFDUCxTQUFTLENBQUMsQ0FDdkJRLEtBQUssQ0FBQyxRQUFvQjtNQUFBLElBQW5CLENBQUNDLEdBQUcsRUFBRUMsT0FBTyxDQUFDO01BQ3BCLElBQUlBLE9BQU8sS0FBSyxJQUFJLEVBQUU7UUFDcEIsSUFBSSxDQUFDbkIsTUFBTSxDQUFDb0IsSUFBSSxDQUFDTCxLQUFLLEVBQUVHLEdBQUcsQ0FBQyxFQUFFO1VBQzVCLE9BQU8sS0FBSztRQUNkLENBQUMsTUFBTSxJQUFJLE9BQU9DLE9BQU8sS0FBSyxVQUFVLEVBQUU7VUFDeEMsSUFBSSxDQUFFQSxPQUFPLENBQUNKLEtBQUssQ0FBQ0csR0FBRyxDQUFDLENBQUUsRUFBRTtZQUMxQixPQUFPLEtBQUs7VUFDZDtRQUNGLENBQUMsTUFBTSxJQUFJQyxPQUFPLEtBQUtKLEtBQUssQ0FBQ0csR0FBRyxDQUFDLEVBQUU7VUFDakMsT0FBTyxLQUFLO1FBQ2Q7TUFDRjtNQUNBLE9BQU8sSUFBSTtJQUNiLENBQUMsQ0FBQztFQUNOOztFQUVBO0VBQ0E7RUFDQTtFQUNBRyxrQkFBa0IsQ0FBQ04sS0FBSyxFQUFFO0lBQ3hCLE9BQU9kLE1BQU0sQ0FBQ2UsT0FBTyxDQUFDLElBQUksQ0FBQ1AsU0FBUyxDQUFDLENBQ2xDYSxNQUFNLENBQUM7TUFBQSxJQUFDLENBQUNKLEdBQUcsQ0FBQztNQUFBLE9BQUssSUFBSSxDQUFDVCxTQUFTLENBQUNTLEdBQUcsQ0FBQyxLQUFLLElBQUk7SUFBQSxFQUFDLENBQy9DSyxNQUFNLENBQUMsQ0FBQ0MsWUFBWSxZQUFxQjtNQUFBLElBQW5CLENBQUNOLEdBQUcsRUFBRUMsT0FBTyxDQUFDO01BQ25DLElBQUksT0FBT0EsT0FBTyxLQUFLLFVBQVUsRUFBRTtRQUNqQyxJQUFJQSxPQUFPLENBQUNKLEtBQUssQ0FBQ0csR0FBRyxDQUFDLENBQUMsRUFBRTtVQUN2Qk0sWUFBWSxJQUFJTixHQUFHLEdBQUdILEtBQUssQ0FBQ0csR0FBRyxDQUFDO1FBQ2xDO01BQ0YsQ0FBQyxNQUFNO1FBQ0xNLFlBQVksSUFBSU4sR0FBRyxHQUFHSCxLQUFLLENBQUNHLEdBQUcsQ0FBQztNQUNsQztNQUNBLE9BQU9NLFlBQVk7SUFDckIsQ0FBQyxFQUFFLEVBQUUsQ0FBQztFQUNWOztFQUVBO0VBQ0E7RUFDQUMsS0FBSyxDQUFDVixLQUFLLEVBQUU7SUFDWCxNQUFNRyxHQUFHLEdBQUcsSUFBSSxDQUFDRyxrQkFBa0IsQ0FBQ04sS0FBSyxDQUFDO0lBQzFDLE1BQU1XLGtCQUFrQixHQUFHLElBQUlmLElBQUksRUFBRSxDQUFDQyxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUNGLGNBQWM7SUFDckUsTUFBTWlCLGVBQWUsR0FBRyxJQUFJLENBQUNyQixPQUFPLENBQUNzQixZQUFZLEdBQUdGLGtCQUFrQjtJQUN0RSxPQUFPO01BQ0xSLEdBQUc7TUFDSFEsa0JBQWtCO01BQ2xCQztJQUNGLENBQUM7RUFDSDs7RUFFQTtFQUNBO0VBQ0E7RUFDQUUsWUFBWSxHQUFHO0lBQ2I7SUFDQSxJQUFJLENBQUNoQixRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLElBQUksQ0FBQ0gsY0FBYyxHQUFHLElBQUlDLElBQUksRUFBRSxDQUFDQyxPQUFPLEVBQUU7RUFDNUM7RUFFQWtCLGdCQUFnQixDQUFDQyxLQUFLLEVBQUVDLFNBQVMsRUFBRTtJQUNqQyxJQUFJO01BQ0YsSUFBSSxJQUFJLENBQUMxQixPQUFPLENBQUMyQixRQUFRLEVBQUU7UUFDekIsSUFBSSxDQUFDM0IsT0FBTyxDQUFDMkIsUUFBUSxDQUFDRixLQUFLLEVBQUVDLFNBQVMsQ0FBQztNQUN6QztJQUNGLENBQUMsQ0FBQyxPQUFPRSxDQUFDLEVBQUU7TUFDVjtNQUNBQyxPQUFPLENBQUNDLEtBQUssQ0FBQ0YsQ0FBQyxDQUFDO0lBQ2xCO0VBQ0Y7QUFDRjtBQUVBLE1BQU16QyxXQUFXLENBQUM7RUFDaEI7RUFDQVksV0FBVyxHQUFHO0lBQ1o7SUFDQTtJQUNBOztJQUVBLElBQUksQ0FBQ2dDLEtBQUssR0FBRyxDQUFDLENBQUM7RUFDakI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxLQUFLLENBQUN2QixLQUFLLEVBQUU7SUFDWCxNQUFNZ0IsS0FBSyxHQUFHO01BQ1pRLE9BQU8sRUFBRSxJQUFJO01BQ2JDLFdBQVcsRUFBRSxDQUFDO01BQ2RDLGtCQUFrQixFQUFFQztJQUN0QixDQUFDO0lBRUQsTUFBTUMsWUFBWSxHQUFHLElBQUksQ0FBQ0MscUJBQXFCLENBQUM3QixLQUFLLENBQUM7SUFDdEQ0QixZQUFZLENBQUNFLE9BQU8sQ0FBRUMsSUFBSSxJQUFLO01BQzdCLE1BQU1DLFVBQVUsR0FBR0QsSUFBSSxDQUFDckIsS0FBSyxDQUFDVixLQUFLLENBQUM7TUFDcEMsSUFBSWlDLGNBQWMsR0FBR0YsSUFBSSxDQUFDakMsUUFBUSxDQUFDa0MsVUFBVSxDQUFDN0IsR0FBRyxDQUFDO01BRWxELElBQUk2QixVQUFVLENBQUNwQixlQUFlLEdBQUcsQ0FBQyxFQUFFO1FBQ2xDO1FBQ0FtQixJQUFJLENBQUNqQixZQUFZLEVBQUU7UUFDbkJrQixVQUFVLENBQUNyQixrQkFBa0IsR0FBRyxJQUFJZixJQUFJLEVBQUUsQ0FBQ0MsT0FBTyxFQUFFLEdBQ2xEa0MsSUFBSSxDQUFDcEMsY0FBYztRQUNyQnFDLFVBQVUsQ0FBQ3BCLGVBQWUsR0FBR21CLElBQUksQ0FBQ3hDLE9BQU8sQ0FBQ3NCLFlBQVk7UUFDdERvQixjQUFjLEdBQUcsQ0FBQztNQUNwQjtNQUVBLElBQUlBLGNBQWMsR0FBR0YsSUFBSSxDQUFDeEMsT0FBTyxDQUFDMkMsa0JBQWtCLEVBQUU7UUFDcEQ7UUFDQTtRQUNBO1FBQ0E7UUFDQSxJQUFJbEIsS0FBSyxDQUFDUyxXQUFXLEdBQUdPLFVBQVUsQ0FBQ3BCLGVBQWUsRUFBRTtVQUNsREksS0FBSyxDQUFDUyxXQUFXLEdBQUdPLFVBQVUsQ0FBQ3BCLGVBQWU7UUFDaEQ7UUFDQUksS0FBSyxDQUFDUSxPQUFPLEdBQUcsS0FBSztRQUNyQlIsS0FBSyxDQUFDVSxrQkFBa0IsR0FBRyxDQUFDO1FBQzVCVixLQUFLLENBQUNtQixNQUFNLEdBQUdKLElBQUksQ0FBQ3RDLEVBQUU7UUFDdEJzQyxJQUFJLENBQUNoQixnQkFBZ0IsQ0FBQ0MsS0FBSyxFQUFFaEIsS0FBSyxDQUFDO01BQ3JDLENBQUMsTUFBTTtRQUNMO1FBQ0E7UUFDQSxJQUFJK0IsSUFBSSxDQUFDeEMsT0FBTyxDQUFDMkMsa0JBQWtCLEdBQUdELGNBQWMsR0FDbERqQixLQUFLLENBQUNVLGtCQUFrQixJQUFJVixLQUFLLENBQUNRLE9BQU8sRUFBRTtVQUMzQ1IsS0FBSyxDQUFDUyxXQUFXLEdBQUdPLFVBQVUsQ0FBQ3BCLGVBQWU7VUFDOUNJLEtBQUssQ0FBQ1Usa0JBQWtCLEdBQUdLLElBQUksQ0FBQ3hDLE9BQU8sQ0FBQzJDLGtCQUFrQixHQUN4REQsY0FBYztRQUNsQjtRQUNBakIsS0FBSyxDQUFDbUIsTUFBTSxHQUFHSixJQUFJLENBQUN0QyxFQUFFO1FBQ3RCc0MsSUFBSSxDQUFDaEIsZ0JBQWdCLENBQUNDLEtBQUssRUFBRWhCLEtBQUssQ0FBQztNQUNyQztJQUNGLENBQUMsQ0FBQztJQUNGLE9BQU9nQixLQUFLO0VBQ2Q7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFb0IsT0FBTyxDQUFDTCxJQUFJLEVBQUVHLGtCQUFrQixFQUFFckIsWUFBWSxFQUFFSyxRQUFRLEVBQUU7SUFDeEQsTUFBTTNCLE9BQU8sR0FBRztNQUNkMkMsa0JBQWtCLEVBQUVBLGtCQUFrQixJQUFJbEQsNkJBQTZCO01BQ3ZFNkIsWUFBWSxFQUFFQSxZQUFZLElBQUk5QixxQ0FBcUM7TUFDbkVtQyxRQUFRLEVBQUVBLFFBQVEsSUFBSXZDLE1BQU0sQ0FBQzBELGVBQWUsQ0FBQ25CLFFBQVE7SUFDdkQsQ0FBQztJQUVELE1BQU1vQixPQUFPLEdBQUcsSUFBSWpELElBQUksQ0FBQ0UsT0FBTyxFQUFFd0MsSUFBSSxDQUFDO0lBQ3ZDLElBQUksQ0FBQ1QsS0FBSyxDQUFDZ0IsT0FBTyxDQUFDN0MsRUFBRSxDQUFDLEdBQUc2QyxPQUFPO0lBQ2hDLE9BQU9BLE9BQU8sQ0FBQzdDLEVBQUU7RUFDbkI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtFQUNFOEMsU0FBUyxDQUFDdkMsS0FBSyxFQUFFO0lBQ2Y7SUFDQSxNQUFNNEIsWUFBWSxHQUFHLElBQUksQ0FBQ0MscUJBQXFCLENBQUM3QixLQUFLLENBQUM7SUFDdEQ0QixZQUFZLENBQUNFLE9BQU8sQ0FBRUMsSUFBSSxJQUFLO01BQzdCLE1BQU1DLFVBQVUsR0FBR0QsSUFBSSxDQUFDckIsS0FBSyxDQUFDVixLQUFLLENBQUM7TUFFcEMsSUFBSWdDLFVBQVUsQ0FBQ3JCLGtCQUFrQixHQUFHb0IsSUFBSSxDQUFDeEMsT0FBTyxDQUFDc0IsWUFBWSxFQUFFO1FBQzdEO1FBQ0FrQixJQUFJLENBQUNqQixZQUFZLEVBQUU7TUFDckI7O01BRUE7TUFDQTtNQUNBLElBQUk3QixNQUFNLENBQUNvQixJQUFJLENBQUMwQixJQUFJLENBQUNqQyxRQUFRLEVBQUVrQyxVQUFVLENBQUM3QixHQUFHLENBQUMsRUFBRTtRQUM5QzRCLElBQUksQ0FBQ2pDLFFBQVEsQ0FBQ2tDLFVBQVUsQ0FBQzdCLEdBQUcsQ0FBQyxFQUFFO01BQ2pDLENBQUMsTUFBTTtRQUNMNEIsSUFBSSxDQUFDakMsUUFBUSxDQUFDa0MsVUFBVSxDQUFDN0IsR0FBRyxDQUFDLEdBQUcsQ0FBQztNQUNuQztJQUNGLENBQUMsQ0FBQztFQUNKOztFQUVBO0VBQ0EwQixxQkFBcUIsQ0FBQzdCLEtBQUssRUFBRTtJQUMzQixPQUFPZCxNQUFNLENBQUNzRCxNQUFNLENBQUMsSUFBSSxDQUFDbEIsS0FBSyxDQUFDLENBQUNmLE1BQU0sQ0FBQ3dCLElBQUksSUFBSUEsSUFBSSxDQUFDaEMsS0FBSyxDQUFDQyxLQUFLLENBQUMsQ0FBQztFQUNwRTs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRXlDLFVBQVUsQ0FBQ2hELEVBQUUsRUFBRTtJQUNiLElBQUksSUFBSSxDQUFDNkIsS0FBSyxDQUFDN0IsRUFBRSxDQUFDLEVBQUU7TUFDbEIsT0FBTyxJQUFJLENBQUM2QixLQUFLLENBQUM3QixFQUFFLENBQUM7TUFDckIsT0FBTyxJQUFJO0lBQ2I7SUFDQSxPQUFPLEtBQUs7RUFDZDtBQUNGLEMiLCJmaWxlIjoiL3BhY2thZ2VzL3JhdGUtbGltaXQuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcbmltcG9ydCB7IFJhbmRvbSB9IGZyb20gJ21ldGVvci9yYW5kb20nO1xuXG4vLyBEZWZhdWx0IHRpbWUgaW50ZXJ2YWwgKGluIG1pbGxpc2Vjb25kcykgdG8gcmVzZXQgcmF0ZSBsaW1pdCBjb3VudGVyc1xuY29uc3QgREVGQVVMVF9JTlRFUlZBTF9USU1FX0lOX01JTExJU0VDT05EUyA9IDEwMDA7XG4vLyBEZWZhdWx0IG51bWJlciBvZiBldmVudHMgYWxsb3dlZCBwZXIgdGltZSBpbnRlcnZhbFxuY29uc3QgREVGQVVMVF9SRVFVRVNUU19QRVJfSU5URVJWQUwgPSAxMDtcblxuY29uc3QgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLy8gQSBydWxlIGlzIGRlZmluZWQgYnkgYW4gb3B0aW9ucyBvYmplY3QgdGhhdCBjb250YWlucyB0d28gZmllbGRzLFxuLy8gYG51bVJlcXVlc3RzQWxsb3dlZGAgd2hpY2ggaXMgdGhlIG51bWJlciBvZiBldmVudHMgYWxsb3dlZCBwZXIgaW50ZXJ2YWwsIGFuZFxuLy8gYW4gYGludGVydmFsVGltZWAgd2hpY2ggaXMgdGhlIGFtb3VudCBvZiB0aW1lIGluIG1pbGxpc2Vjb25kcyBiZWZvcmUgdGhlXG4vLyByYXRlIGxpbWl0IHJlc3RhcnRzIGl0cyBpbnRlcm5hbCBjb3VudGVycywgYW5kIGJ5IGEgbWF0Y2hlcnMgb2JqZWN0LiBBXG4vLyBtYXRjaGVycyBvYmplY3QgaXMgYSBQT0pPIHRoYXQgY29udGFpbnMgYSBzZXQgb2Yga2V5cyB3aXRoIHZhbHVlcyB0aGF0XG4vLyBkZWZpbmUgdGhlIGVudGlyZSBzZXQgb2YgaW5wdXRzIHRoYXQgbWF0Y2ggZm9yIGVhY2gga2V5LiBUaGUgdmFsdWVzIGNhblxuLy8gZWl0aGVyIGJlIG51bGwgKG9wdGlvbmFsKSwgYSBwcmltaXRpdmUgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBib29sZWFuXG4vLyBvZiB3aGV0aGVyIHRoZSBwcm92aWRlZCBpbnB1dCdzIHZhbHVlIG1hdGNoZXMgZm9yIHRoaXMga2V5LlxuLy9cbi8vIFJ1bGVzIGFyZSB1bmlxdWVseSBhc3NpZ25lZCBhbiBgaWRgIGFuZCB0aGV5IHN0b3JlIGEgZGljdGlvbmFyeSBvZiBjb3VudGVycyxcbi8vIHdoaWNoIGFyZSByZWNvcmRzIHVzZWQgdG8ga2VlcCB0cmFjayBvZiBpbnB1dHMgdGhhdCBtYXRjaCB0aGUgcnVsZS4gSWYgYVxuLy8gY291bnRlciByZWFjaGVzIHRoZSBgbnVtUmVxdWVzdHNBbGxvd2VkYCB3aXRoaW4gYSBnaXZlbiBgaW50ZXJ2YWxUaW1lYCwgYVxuLy8gcmF0ZSBsaW1pdCBpcyByZWFjaGVkIGFuZCBmdXR1cmUgaW5wdXRzIHRoYXQgbWFwIHRvIHRoYXQgY291bnRlciB3aWxsXG4vLyByZXN1bHQgaW4gZXJyb3JzIGJlaW5nIHJldHVybmVkIHRvIHRoZSBjbGllbnQuXG5jbGFzcyBSdWxlIHtcbiAgY29uc3RydWN0b3Iob3B0aW9ucywgbWF0Y2hlcnMpIHtcbiAgICB0aGlzLmlkID0gUmFuZG9tLmlkKCk7XG5cbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXG4gICAgdGhpcy5fbWF0Y2hlcnMgPSBtYXRjaGVycztcblxuICAgIHRoaXMuX2xhc3RSZXNldFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblxuICAgIC8vIERpY3Rpb25hcnkgb2YgaW5wdXQga2V5cyB0byBjb3VudGVyc1xuICAgIHRoaXMuY291bnRlcnMgPSB7fTtcbiAgfVxuICAvLyBEZXRlcm1pbmUgaWYgdGhpcyBydWxlIGFwcGxpZXMgdG8gdGhlIGdpdmVuIGlucHV0IGJ5IGNvbXBhcmluZyBhbGxcbiAgLy8gcnVsZS5tYXRjaGVycy4gSWYgdGhlIG1hdGNoIGZhaWxzLCBzZWFyY2ggc2hvcnQgY2lyY3VpdHMgaW5zdGVhZCBvZlxuICAvLyBpdGVyYXRpbmcgdGhyb3VnaCBhbGwgbWF0Y2hlcnMuXG4gIG1hdGNoKGlucHV0KSB7XG4gICAgcmV0dXJuIE9iamVjdFxuICAgICAgLmVudHJpZXModGhpcy5fbWF0Y2hlcnMpXG4gICAgICAuZXZlcnkoKFtrZXksIG1hdGNoZXJdKSA9PiB7XG4gICAgICAgIGlmIChtYXRjaGVyICE9PSBudWxsKSB7XG4gICAgICAgICAgaWYgKCFoYXNPd24uY2FsbChpbnB1dCwga2V5KSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG1hdGNoZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGlmICghKG1hdGNoZXIoaW5wdXRba2V5XSkpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoZXIgIT09IGlucHV0W2tleV0pIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEdlbmVyYXRlcyB1bmlxdWUga2V5IHN0cmluZyBmb3IgcHJvdmlkZWQgaW5wdXQgYnkgY29uY2F0ZW5hdGluZyBhbGwgdGhlXG4gIC8vIGtleXMgaW4gdGhlIG1hdGNoZXIgd2l0aCB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZXMgaW4gdGhlIGlucHV0LlxuICAvLyBPbmx5IGNhbGxlZCBpZiBydWxlIG1hdGNoZXMgaW5wdXQuXG4gIF9nZW5lcmF0ZUtleVN0cmluZyhpbnB1dCkge1xuICAgIHJldHVybiBPYmplY3QuZW50cmllcyh0aGlzLl9tYXRjaGVycylcbiAgICAgIC5maWx0ZXIoKFtrZXldKSA9PiB0aGlzLl9tYXRjaGVyc1trZXldICE9PSBudWxsKVxuICAgICAgLnJlZHVjZSgocmV0dXJuU3RyaW5nLCBba2V5LCBtYXRjaGVyXSkgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIG1hdGNoZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBpZiAobWF0Y2hlcihpbnB1dFtrZXldKSkge1xuICAgICAgICAgICAgcmV0dXJuU3RyaW5nICs9IGtleSArIGlucHV0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVyblN0cmluZyArPSBrZXkgKyBpbnB1dFtrZXldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXR1cm5TdHJpbmc7XG4gICAgICB9LCAnJyk7XG4gIH1cblxuICAvLyBBcHBsaWVzIHRoZSBwcm92aWRlZCBpbnB1dCBhbmQgcmV0dXJucyB0aGUga2V5IHN0cmluZywgdGltZSBzaW5jZSBjb3VudGVyc1xuICAvLyB3ZXJlIGxhc3QgcmVzZXQgYW5kIHRpbWUgdG8gbmV4dCByZXNldC5cbiAgYXBwbHkoaW5wdXQpIHtcbiAgICBjb25zdCBrZXkgPSB0aGlzLl9nZW5lcmF0ZUtleVN0cmluZyhpbnB1dCk7XG4gICAgY29uc3QgdGltZVNpbmNlTGFzdFJlc2V0ID0gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0aGlzLl9sYXN0UmVzZXRUaW1lO1xuICAgIGNvbnN0IHRpbWVUb05leHRSZXNldCA9IHRoaXMub3B0aW9ucy5pbnRlcnZhbFRpbWUgLSB0aW1lU2luY2VMYXN0UmVzZXQ7XG4gICAgcmV0dXJuIHtcbiAgICAgIGtleSxcbiAgICAgIHRpbWVTaW5jZUxhc3RSZXNldCxcbiAgICAgIHRpbWVUb05leHRSZXNldCxcbiAgICB9O1xuICB9XG5cbiAgLy8gUmVzZXQgY291bnRlciBkaWN0aW9uYXJ5IGZvciB0aGlzIHNwZWNpZmljIHJ1bGUuIENhbGxlZCBvbmNlIHRoZVxuICAvLyB0aW1lU2luY2VMYXN0UmVzZXQgaGFzIGV4Y2VlZGVkIHRoZSBpbnRlcnZhbFRpbWUuIF9sYXN0UmVzZXRUaW1lIGlzXG4gIC8vIHNldCB0byBiZSB0aGUgY3VycmVudCB0aW1lIGluIG1pbGxpc2Vjb25kcy5cbiAgcmVzZXRDb3VudGVyKCkge1xuICAgIC8vIERlbGV0ZSB0aGUgb2xkIGNvdW50ZXJzIGRpY3Rpb25hcnkgdG8gYWxsb3cgZm9yIGdhcmJhZ2UgY29sbGVjdGlvblxuICAgIHRoaXMuY291bnRlcnMgPSB7fTtcbiAgICB0aGlzLl9sYXN0UmVzZXRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH1cblxuICBfZXhlY3V0ZUNhbGxiYWNrKHJlcGx5LCBydWxlSW5wdXQpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMub3B0aW9ucy5jYWxsYmFjaykge1xuICAgICAgICB0aGlzLm9wdGlvbnMuY2FsbGJhY2socmVwbHksIHJ1bGVJbnB1dCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLy8gRG8gbm90IHRocm93IGVycm9yIGhlcmVcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIFJhdGVMaW1pdGVyIHtcbiAgLy8gSW5pdGlhbGl6ZSBydWxlcyB0byBiZSBhbiBlbXB0eSBkaWN0aW9uYXJ5LlxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvLyBEaWN0aW9uYXJ5IG9mIGFsbCBydWxlcyBhc3NvY2lhdGVkIHdpdGggdGhpcyBSYXRlTGltaXRlciwga2V5ZWQgYnkgdGhlaXJcbiAgICAvLyBpZC4gRWFjaCBydWxlIG9iamVjdCBzdG9yZXMgdGhlIHJ1bGUgcGF0dGVybiwgbnVtYmVyIG9mIGV2ZW50cyBhbGxvd2VkLFxuICAgIC8vIGxhc3QgcmVzZXQgdGltZSBhbmQgdGhlIHJ1bGUgcmVzZXQgaW50ZXJ2YWwgaW4gbWlsbGlzZWNvbmRzLlxuXG4gICAgdGhpcy5ydWxlcyA9IHt9O1xuICB9XG5cbiAgLyoqXG4gICogQ2hlY2tzIGlmIHRoaXMgaW5wdXQgaGFzIGV4Y2VlZGVkIGFueSByYXRlIGxpbWl0cy5cbiAgKiBAcGFyYW0gIHtvYmplY3R9IGlucHV0IGRpY3Rpb25hcnkgY29udGFpbmluZyBrZXktdmFsdWUgcGFpcnMgb2YgYXR0cmlidXRlc1xuICAqIHRoYXQgbWF0Y2ggdG8gcnVsZXNcbiAgKiBAcmV0dXJuIHtvYmplY3R9IFJldHVybnMgb2JqZWN0IG9mIGZvbGxvd2luZyBzdHJ1Y3R1cmVcbiAgKiB7ICdhbGxvd2VkJzogYm9vbGVhbiAtIGlzIHRoaXMgaW5wdXQgYWxsb3dlZFxuICAqICAgJ3RpbWVUb1Jlc2V0JzogaW50ZWdlciB8IEluZmluaXR5IC0gcmV0dXJucyB0aW1lIHVudGlsIGNvdW50ZXJzIGFyZSByZXNldFxuICAqICAgICAgICAgICAgICAgICAgIGluIG1pbGxpc2Vjb25kc1xuICAqICAgJ251bUludm9jYXRpb25zTGVmdCc6IGludGVnZXIgfCBJbmZpbml0eSAtIHJldHVybnMgbnVtYmVyIG9mIGNhbGxzIGxlZnRcbiAgKiAgIGJlZm9yZSBsaW1pdCBpcyByZWFjaGVkXG4gICogfVxuICAqIElmIG11bHRpcGxlIHJ1bGVzIG1hdGNoLCB0aGUgbGVhc3QgbnVtYmVyIG9mIGludm9jYXRpb25zIGxlZnQgaXMgcmV0dXJuZWQuXG4gICogSWYgdGhlIHJhdGUgbGltaXQgaGFzIGJlZW4gcmVhY2hlZCwgdGhlIGxvbmdlc3QgdGltZVRvUmVzZXQgaXMgcmV0dXJuZWQuXG4gICovXG4gIGNoZWNrKGlucHV0KSB7XG4gICAgY29uc3QgcmVwbHkgPSB7XG4gICAgICBhbGxvd2VkOiB0cnVlLFxuICAgICAgdGltZVRvUmVzZXQ6IDAsXG4gICAgICBudW1JbnZvY2F0aW9uc0xlZnQ6IEluZmluaXR5LFxuICAgIH07XG5cbiAgICBjb25zdCBtYXRjaGVkUnVsZXMgPSB0aGlzLl9maW5kQWxsTWF0Y2hpbmdSdWxlcyhpbnB1dCk7XG4gICAgbWF0Y2hlZFJ1bGVzLmZvckVhY2goKHJ1bGUpID0+IHtcbiAgICAgIGNvbnN0IHJ1bGVSZXN1bHQgPSBydWxlLmFwcGx5KGlucHV0KTtcbiAgICAgIGxldCBudW1JbnZvY2F0aW9ucyA9IHJ1bGUuY291bnRlcnNbcnVsZVJlc3VsdC5rZXldO1xuXG4gICAgICBpZiAocnVsZVJlc3VsdC50aW1lVG9OZXh0UmVzZXQgPCAwKSB7XG4gICAgICAgIC8vIFJlc2V0IGFsbCB0aGUgY291bnRlcnMgc2luY2UgdGhlIHJ1bGUgaGFzIHJlc2V0XG4gICAgICAgIHJ1bGUucmVzZXRDb3VudGVyKCk7XG4gICAgICAgIHJ1bGVSZXN1bHQudGltZVNpbmNlTGFzdFJlc2V0ID0gbmV3IERhdGUoKS5nZXRUaW1lKCkgLVxuICAgICAgICAgIHJ1bGUuX2xhc3RSZXNldFRpbWU7XG4gICAgICAgIHJ1bGVSZXN1bHQudGltZVRvTmV4dFJlc2V0ID0gcnVsZS5vcHRpb25zLmludGVydmFsVGltZTtcbiAgICAgICAgbnVtSW52b2NhdGlvbnMgPSAwO1xuICAgICAgfVxuXG4gICAgICBpZiAobnVtSW52b2NhdGlvbnMgPiBydWxlLm9wdGlvbnMubnVtUmVxdWVzdHNBbGxvd2VkKSB7XG4gICAgICAgIC8vIE9ubHkgdXBkYXRlIHRpbWVUb1Jlc2V0IGlmIHRoZSBuZXcgdGltZSB3b3VsZCBiZSBsb25nZXIgdGhhbiB0aGVcbiAgICAgICAgLy8gcHJldmlvdXNseSBzZXQgdGltZS4gVGhpcyBpcyB0byBlbnN1cmUgdGhhdCBpZiB0aGlzIGlucHV0IHRyaWdnZXJzXG4gICAgICAgIC8vIG11bHRpcGxlIHJ1bGVzLCB3ZSByZXR1cm4gdGhlIGxvbmdlc3QgcGVyaW9kIG9mIHRpbWUgdW50aWwgdGhleSBjYW5cbiAgICAgICAgLy8gc3VjY2Vzc2Z1bGx5IG1ha2UgYW5vdGhlciBjYWxsXG4gICAgICAgIGlmIChyZXBseS50aW1lVG9SZXNldCA8IHJ1bGVSZXN1bHQudGltZVRvTmV4dFJlc2V0KSB7XG4gICAgICAgICAgcmVwbHkudGltZVRvUmVzZXQgPSBydWxlUmVzdWx0LnRpbWVUb05leHRSZXNldDtcbiAgICAgICAgfVxuICAgICAgICByZXBseS5hbGxvd2VkID0gZmFsc2U7XG4gICAgICAgIHJlcGx5Lm51bUludm9jYXRpb25zTGVmdCA9IDA7XG4gICAgICAgIHJlcGx5LnJ1bGVJZCA9IHJ1bGUuaWQ7XG4gICAgICAgIHJ1bGUuX2V4ZWN1dGVDYWxsYmFjayhyZXBseSwgaW5wdXQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgdGhpcyBpcyBhbiBhbGxvd2VkIGF0dGVtcHQgYW5kIHdlIGhhdmVuJ3QgZmFpbGVkIG9uIGFueSBvZiB0aGVcbiAgICAgICAgLy8gb3RoZXIgcnVsZXMgdGhhdCBtYXRjaCwgdXBkYXRlIHRoZSByZXBseSBmaWVsZC5cbiAgICAgICAgaWYgKHJ1bGUub3B0aW9ucy5udW1SZXF1ZXN0c0FsbG93ZWQgLSBudW1JbnZvY2F0aW9ucyA8XG4gICAgICAgICAgcmVwbHkubnVtSW52b2NhdGlvbnNMZWZ0ICYmIHJlcGx5LmFsbG93ZWQpIHtcbiAgICAgICAgICByZXBseS50aW1lVG9SZXNldCA9IHJ1bGVSZXN1bHQudGltZVRvTmV4dFJlc2V0O1xuICAgICAgICAgIHJlcGx5Lm51bUludm9jYXRpb25zTGVmdCA9IHJ1bGUub3B0aW9ucy5udW1SZXF1ZXN0c0FsbG93ZWQgLVxuICAgICAgICAgICAgbnVtSW52b2NhdGlvbnM7XG4gICAgICAgIH1cbiAgICAgICAgcmVwbHkucnVsZUlkID0gcnVsZS5pZDtcbiAgICAgICAgcnVsZS5fZXhlY3V0ZUNhbGxiYWNrKHJlcGx5LCBpbnB1dCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlcGx5O1xuICB9XG5cbiAgLyoqXG4gICogQWRkcyBhIHJ1bGUgdG8gZGljdGlvbmFyeSBvZiBydWxlcyB0aGF0IGFyZSBjaGVja2VkIGFnYWluc3Qgb24gZXZlcnkgY2FsbC5cbiAgKiBPbmx5IGlucHV0cyB0aGF0IHBhc3MgYWxsIG9mIHRoZSBydWxlcyB3aWxsIGJlIGFsbG93ZWQuIFJldHVybnMgdW5pcXVlIHJ1bGVcbiAgKiBpZCB0aGF0IGNhbiBiZSBwYXNzZWQgdG8gYHJlbW92ZVJ1bGVgLlxuICAqIEBwYXJhbSB7b2JqZWN0fSBydWxlICAgIElucHV0IGRpY3Rpb25hcnkgZGVmaW5pbmcgY2VydGFpbiBhdHRyaWJ1dGVzIGFuZFxuICAqIHJ1bGVzIGFzc29jaWF0ZWQgd2l0aCB0aGVtLlxuICAqIEVhY2ggYXR0cmlidXRlJ3MgdmFsdWUgY2FuIGVpdGhlciBiZSBhIHZhbHVlLCBhIGZ1bmN0aW9uIG9yIG51bGwuIEFsbFxuICAqIGZ1bmN0aW9ucyBtdXN0IHJldHVybiBhIGJvb2xlYW4gb2Ygd2hldGhlciB0aGUgaW5wdXQgaXMgbWF0Y2hlZCBieSB0aGF0XG4gICogYXR0cmlidXRlJ3MgcnVsZSBvciBub3RcbiAgKiBAcGFyYW0ge2ludGVnZXJ9IG51bVJlcXVlc3RzQWxsb3dlZCBPcHRpb25hbC4gTnVtYmVyIG9mIGV2ZW50cyBhbGxvd2VkIHBlclxuICAqIGludGVydmFsLiBEZWZhdWx0ID0gMTAuXG4gICogQHBhcmFtIHtpbnRlZ2VyfSBpbnRlcnZhbFRpbWUgT3B0aW9uYWwuIE51bWJlciBvZiBtaWxsaXNlY29uZHMgYmVmb3JlXG4gICogcnVsZSdzIGNvdW50ZXJzIGFyZSByZXNldC4gRGVmYXVsdCA9IDEwMDAuXG4gICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgT3B0aW9uYWwuIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBhZnRlciBhXG4gICogcnVsZSBpcyBleGVjdXRlZC4gVHdvIG9iamVjdHMgd2lsbCBiZSBwYXNzZWQgdG8gdGhpcyBmdW5jdGlvbi5cbiAgKiBUaGUgZmlyc3Qgb25lIGlzIHRoZSByZXN1bHQgb2YgUmF0ZUxpbWl0ZXIucHJvdG90eXBlLmNoZWNrXG4gICogVGhlIHNlY29uZCBpcyB0aGUgaW5wdXQgb2JqZWN0IG9mIHRoZSBydWxlLCBpdCBoYXMgdGhlIGZvbGxvd2luZyBzdHJ1Y3R1cmU6XG4gICoge1xuICAqICAgJ3R5cGUnOiBzdHJpbmcgLSBlaXRoZXIgJ21ldGhvZCcgb3IgJ3N1YnNjcmlwdGlvbidcbiAgKiAgICduYW1lJzogc3RyaW5nIC0gdGhlIG5hbWUgb2YgdGhlIG1ldGhvZCBvciBzdWJzY3JpcHRpb24gYmVpbmcgY2FsbGVkXG4gICogICAndXNlcklkJzogc3RyaW5nIC0gdGhlIHVzZXIgSUQgYXR0ZW1wdGluZyB0aGUgbWV0aG9kIG9yIHN1YnNjcmlwdGlvblxuICAqICAgJ2Nvbm5lY3Rpb25JZCc6IHN0cmluZyAtIGEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgdXNlcidzIEREUCBjb25uZWN0aW9uXG4gICogICAnY2xpZW50QWRkcmVzcyc6IHN0cmluZyAtIHRoZSBJUCBhZGRyZXNzIG9mIHRoZSB1c2VyXG4gICogfVxuICAqIEByZXR1cm4ge3N0cmluZ30gUmV0dXJucyB1bmlxdWUgcnVsZSBpZFxuICAqL1xuICBhZGRSdWxlKHJ1bGUsIG51bVJlcXVlc3RzQWxsb3dlZCwgaW50ZXJ2YWxUaW1lLCBjYWxsYmFjaykge1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBudW1SZXF1ZXN0c0FsbG93ZWQ6IG51bVJlcXVlc3RzQWxsb3dlZCB8fCBERUZBVUxUX1JFUVVFU1RTX1BFUl9JTlRFUlZBTCxcbiAgICAgIGludGVydmFsVGltZTogaW50ZXJ2YWxUaW1lIHx8IERFRkFVTFRfSU5URVJWQUxfVElNRV9JTl9NSUxMSVNFQ09ORFMsXG4gICAgICBjYWxsYmFjazogY2FsbGJhY2sgJiYgTWV0ZW9yLmJpbmRFbnZpcm9ubWVudChjYWxsYmFjayksXG4gICAgfTtcblxuICAgIGNvbnN0IG5ld1J1bGUgPSBuZXcgUnVsZShvcHRpb25zLCBydWxlKTtcbiAgICB0aGlzLnJ1bGVzW25ld1J1bGUuaWRdID0gbmV3UnVsZTtcbiAgICByZXR1cm4gbmV3UnVsZS5pZDtcbiAgfVxuXG4gIC8qKlxuICAqIEluY3JlbWVudCBjb3VudGVycyBpbiBldmVyeSBydWxlIHRoYXQgbWF0Y2ggdG8gdGhpcyBpbnB1dFxuICAqIEBwYXJhbSAge29iamVjdH0gaW5wdXQgRGljdGlvbmFyeSBvYmplY3QgY29udGFpbmluZyBhdHRyaWJ1dGVzIHRoYXQgbWF5XG4gICogbWF0Y2ggdG8gcnVsZXNcbiAgKi9cbiAgaW5jcmVtZW50KGlucHV0KSB7XG4gICAgLy8gT25seSBpbmNyZW1lbnQgcnVsZSBjb3VudGVycyB0aGF0IG1hdGNoIHRoaXMgaW5wdXRcbiAgICBjb25zdCBtYXRjaGVkUnVsZXMgPSB0aGlzLl9maW5kQWxsTWF0Y2hpbmdSdWxlcyhpbnB1dCk7XG4gICAgbWF0Y2hlZFJ1bGVzLmZvckVhY2goKHJ1bGUpID0+IHtcbiAgICAgIGNvbnN0IHJ1bGVSZXN1bHQgPSBydWxlLmFwcGx5KGlucHV0KTtcblxuICAgICAgaWYgKHJ1bGVSZXN1bHQudGltZVNpbmNlTGFzdFJlc2V0ID4gcnVsZS5vcHRpb25zLmludGVydmFsVGltZSkge1xuICAgICAgICAvLyBSZXNldCBhbGwgdGhlIGNvdW50ZXJzIHNpbmNlIHRoZSBydWxlIGhhcyByZXNldFxuICAgICAgICBydWxlLnJlc2V0Q291bnRlcigpO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayB3aGV0aGVyIHRoZSBrZXkgZXhpc3RzLCBpbmNyZW1lbnRpbmcgaXQgaWYgc28gb3Igb3RoZXJ3aXNlXG4gICAgICAvLyBhZGRpbmcgdGhlIGtleSBhbmQgc2V0dGluZyBpdHMgdmFsdWUgdG8gMVxuICAgICAgaWYgKGhhc093bi5jYWxsKHJ1bGUuY291bnRlcnMsIHJ1bGVSZXN1bHQua2V5KSkge1xuICAgICAgICBydWxlLmNvdW50ZXJzW3J1bGVSZXN1bHQua2V5XSsrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcnVsZS5jb3VudGVyc1tydWxlUmVzdWx0LmtleV0gPSAxO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhbiBhcnJheSBvZiBhbGwgcnVsZXMgdGhhdCBhcHBseSB0byBwcm92aWRlZCBpbnB1dFxuICBfZmluZEFsbE1hdGNoaW5nUnVsZXMoaW5wdXQpIHtcbiAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyh0aGlzLnJ1bGVzKS5maWx0ZXIocnVsZSA9PiBydWxlLm1hdGNoKGlucHV0KSk7XG4gIH1cblxuICAvKipcbiAgICogUHJvdmlkZXMgYSBtZWNoYW5pc20gdG8gcmVtb3ZlIHJ1bGVzIGZyb20gdGhlIHJhdGUgbGltaXRlci4gUmV0dXJucyBib29sZWFuXG4gICAqIGFib3V0IHN1Y2Nlc3MuXG4gICAqIEBwYXJhbSAge3N0cmluZ30gaWQgUnVsZSBpZCByZXR1cm5lZCBmcm9tICNhZGRSdWxlXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiBydWxlIHdhcyBmb3VuZCBhbmQgZGVsZXRlZCwgZWxzZSBmYWxzZS5cbiAgICovXG4gIHJlbW92ZVJ1bGUoaWQpIHtcbiAgICBpZiAodGhpcy5ydWxlc1tpZF0pIHtcbiAgICAgIGRlbGV0ZSB0aGlzLnJ1bGVzW2lkXTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZXhwb3J0IHsgUmF0ZUxpbWl0ZXIgfTtcbiJdfQ==
