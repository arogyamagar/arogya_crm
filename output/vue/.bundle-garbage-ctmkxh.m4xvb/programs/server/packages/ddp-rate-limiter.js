(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var RateLimiter = Package['rate-limit'].RateLimiter;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var DDPRateLimiter;

var require = meteorInstall({"node_modules":{"meteor":{"ddp-rate-limiter":{"ddp-rate-limiter.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////
//                                                                              //
// packages/ddp-rate-limiter/ddp-rate-limiter.js                                //
//                                                                              //
//////////////////////////////////////////////////////////////////////////////////
                                                                                //
module.export({
  DDPRateLimiter: () => DDPRateLimiter
});
let RateLimiter;
module.link("meteor/rate-limit", {
  RateLimiter(v) {
    RateLimiter = v;
  }
}, 0);
// Rate Limiter built into DDP with a default error message. See README or
// online documentation for more details.
const DDPRateLimiter = {};
let errorMessage = rateLimitResult => {
  return 'Error, too many requests. Please slow down. You must wait ' + "".concat(Math.ceil(rateLimitResult.timeToReset / 1000), " seconds before ") + 'trying again.';
};

// Store rule specific error messages.
const errorMessageByRule = new Map();
const rateLimiter = new RateLimiter();
DDPRateLimiter.getErrorMessage = rateLimitResult => {
  // If there is a specific error message for this rule, use it.
  if (errorMessageByRule.has(rateLimitResult.ruleId)) {
    const message = errorMessageByRule.get(rateLimitResult.ruleId);
    // if it's a function, we need to call it
    if (typeof message === 'function') {
      // call the function with the rateLimitResult
      return message(rateLimitResult);
    }
    // otherwise, just return the string
    return message;
  }

  // Otherwise, use the default error message.
  if (typeof errorMessage === 'function') {
    return errorMessage(rateLimitResult);
  }
  return errorMessage;
};

/**
 * @summary Set error message text when method or subscription rate limit
 * exceeded.
 * @param {string|function} message Functions are passed in an object with a
 * `timeToReset` field that specifies the number of milliseconds until the next
 * method or subscription is allowed to run. The function must return a string
 * of the error message.
 * @locus Server
 */
DDPRateLimiter.setErrorMessage = message => {
  errorMessage = message;
};

/**
 * @summary Set error message text when method or subscription rate limit
 * exceeded for a specific rule.
 * @param {string} ruleId The ruleId returned from `addRule`
 * @param {string|function} message Functions are passed in an object with a
 * `timeToReset` field that specifies the number of milliseconds until the next
 * method or subscription is allowed to run. The function must return a string
 * of the error message.
 * @locus Server
 */
DDPRateLimiter.setErrorMessageOnRule = (ruleId, message) => {
  errorMessageByRule.set(ruleId, message);
};

/**
 * @summary
 * Add a rule that matches against a stream of events describing method or
 * subscription attempts. Each event is an object with the following
 * properties:
 *
 * - `type`: Either "method" or "subscription"
 * - `name`: The name of the method or subscription being called
 * - `userId`: The user ID attempting the method or subscription
 * - `connectionId`: A string representing the user's DDP connection
 * - `clientAddress`: The IP address of the user
 *
 * Returns unique `ruleId` that can be passed to `removeRule`.
 *
 * @param {Object} matcher
 *   Matchers specify which events are counted towards a rate limit. A matcher
 *   is an object that has a subset of the same properties as the event objects
 *   described above. Each value in a matcher object is one of the following:
 *
 *   - a string: for the event to satisfy the matcher, this value must be equal
 *   to the value of the same property in the event object
 *
 *   - a function: for the event to satisfy the matcher, the function must
 *   evaluate to true when passed the value of the same property
 *   in the event object
 *
 * Here's how events are counted: Each event that satisfies the matcher's
 * filter is mapped to a bucket. Buckets are uniquely determined by the
 * event object's values for all properties present in both the matcher and
 * event objects.
 *
 * @param {number} numRequests  number of requests allowed per time interval.
 * Default = 10.
 * @param {number} timeInterval time interval in milliseconds after which
 * rule's counters are reset. Default = 1000.
 * @param {function} callback function to be called after a rule is executed.
 * @locus Server
 */
DDPRateLimiter.addRule = (matcher, numRequests, timeInterval, callback) => rateLimiter.addRule(matcher, numRequests, timeInterval, callback);
DDPRateLimiter.printRules = () => rateLimiter.rules;

/**
 * @summary Removes the specified rule from the rate limiter. If rule had
 * hit a rate limit, that limit is removed as well.
 * @param  {string} id 'ruleId' returned from `addRule`
 * @return {boolean}    True if a rule was removed.
 * @locus Server
 */
DDPRateLimiter.removeRule = id => rateLimiter.removeRule(id);

// This is accessed inside livedata_server.js, but shouldn't be called by any
// user.
DDPRateLimiter._increment = input => {
  rateLimiter.increment(input);
};
DDPRateLimiter._check = input => rateLimiter.check(input);
//////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

var exports = require("/node_modules/meteor/ddp-rate-limiter/ddp-rate-limiter.js");

/* Exports */
Package._define("ddp-rate-limiter", exports, {
  DDPRateLimiter: DDPRateLimiter
});

})();

//# sourceURL=meteor://💻app/packages/ddp-rate-limiter.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvZGRwLXJhdGUtbGltaXRlci9kZHAtcmF0ZS1saW1pdGVyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkREUFJhdGVMaW1pdGVyIiwiUmF0ZUxpbWl0ZXIiLCJsaW5rIiwidiIsImVycm9yTWVzc2FnZSIsInJhdGVMaW1pdFJlc3VsdCIsIk1hdGgiLCJjZWlsIiwidGltZVRvUmVzZXQiLCJlcnJvck1lc3NhZ2VCeVJ1bGUiLCJNYXAiLCJyYXRlTGltaXRlciIsImdldEVycm9yTWVzc2FnZSIsImhhcyIsInJ1bGVJZCIsIm1lc3NhZ2UiLCJnZXQiLCJzZXRFcnJvck1lc3NhZ2UiLCJzZXRFcnJvck1lc3NhZ2VPblJ1bGUiLCJzZXQiLCJhZGRSdWxlIiwibWF0Y2hlciIsIm51bVJlcXVlc3RzIiwidGltZUludGVydmFsIiwiY2FsbGJhY2siLCJwcmludFJ1bGVzIiwicnVsZXMiLCJyZW1vdmVSdWxlIiwiaWQiLCJfaW5jcmVtZW50IiwiaW5wdXQiLCJpbmNyZW1lbnQiLCJfY2hlY2siLCJjaGVjayJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBQSxNQUFNLENBQUNDLE1BQU0sQ0FBQztFQUFDQyxjQUFjLEVBQUMsTUFBSUE7QUFBYyxDQUFDLENBQUM7QUFBQyxJQUFJQyxXQUFXO0FBQUNILE1BQU0sQ0FBQ0ksSUFBSSxDQUFDLG1CQUFtQixFQUFDO0VBQUNELFdBQVcsQ0FBQ0UsQ0FBQyxFQUFDO0lBQUNGLFdBQVcsR0FBQ0UsQ0FBQztFQUFBO0FBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztBQUVySTtBQUNBO0FBQ0EsTUFBTUgsY0FBYyxHQUFHLENBQUMsQ0FBQztBQUV6QixJQUFJSSxZQUFZLEdBQUlDLGVBQWUsSUFBSztFQUN0QyxPQUFPLDREQUE0RCxhQUM5REMsSUFBSSxDQUFDQyxJQUFJLENBQUNGLGVBQWUsQ0FBQ0csV0FBVyxHQUFHLElBQUksQ0FBQyxxQkFBa0IsR0FDbEUsZUFBZTtBQUNuQixDQUFDOztBQUVEO0FBQ0EsTUFBTUMsa0JBQWtCLEdBQUcsSUFBSUMsR0FBRyxFQUFFO0FBRXBDLE1BQU1DLFdBQVcsR0FBRyxJQUFJVixXQUFXLEVBQUU7QUFFckNELGNBQWMsQ0FBQ1ksZUFBZSxHQUFJUCxlQUFlLElBQUs7RUFDcEQ7RUFDQSxJQUFJSSxrQkFBa0IsQ0FBQ0ksR0FBRyxDQUFDUixlQUFlLENBQUNTLE1BQU0sQ0FBQyxFQUFFO0lBQ2xELE1BQU1DLE9BQU8sR0FBR04sa0JBQWtCLENBQUNPLEdBQUcsQ0FBQ1gsZUFBZSxDQUFDUyxNQUFNLENBQUM7SUFDOUQ7SUFDQSxJQUFJLE9BQU9DLE9BQU8sS0FBSyxVQUFVLEVBQUU7TUFDakM7TUFDQSxPQUFPQSxPQUFPLENBQUNWLGVBQWUsQ0FBQztJQUNqQztJQUNBO0lBQ0EsT0FBT1UsT0FBTztFQUNqQjs7RUFFQztFQUNBLElBQUksT0FBT1gsWUFBWSxLQUFLLFVBQVUsRUFBRTtJQUN0QyxPQUFPQSxZQUFZLENBQUNDLGVBQWUsQ0FBQztFQUN0QztFQUNBLE9BQU9ELFlBQVk7QUFDckIsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQUosY0FBYyxDQUFDaUIsZUFBZSxHQUFJRixPQUFPLElBQUs7RUFDNUNYLFlBQVksR0FBR1csT0FBTztBQUN4QixDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FmLGNBQWMsQ0FBQ2tCLHFCQUFxQixHQUFHLENBQUNKLE1BQU0sRUFBRUMsT0FBTyxLQUFLO0VBQzFETixrQkFBa0IsQ0FBQ1UsR0FBRyxDQUFDTCxNQUFNLEVBQUVDLE9BQU8sQ0FBQztBQUN6QyxDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQWYsY0FBYyxDQUFDb0IsT0FBTyxHQUFHLENBQUNDLE9BQU8sRUFBRUMsV0FBVyxFQUFFQyxZQUFZLEVBQUVDLFFBQVEsS0FDcEViLFdBQVcsQ0FBQ1MsT0FBTyxDQUFDQyxPQUFPLEVBQUVDLFdBQVcsRUFBRUMsWUFBWSxFQUFFQyxRQUFRLENBQUM7QUFFbkV4QixjQUFjLENBQUN5QixVQUFVLEdBQUcsTUFBTWQsV0FBVyxDQUFDZSxLQUFLOztBQUVuRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBMUIsY0FBYyxDQUFDMkIsVUFBVSxHQUFHQyxFQUFFLElBQUlqQixXQUFXLENBQUNnQixVQUFVLENBQUNDLEVBQUUsQ0FBQzs7QUFFNUQ7QUFDQTtBQUNBNUIsY0FBYyxDQUFDNkIsVUFBVSxHQUFJQyxLQUFLLElBQUs7RUFDckNuQixXQUFXLENBQUNvQixTQUFTLENBQUNELEtBQUssQ0FBQztBQUM5QixDQUFDO0FBRUQ5QixjQUFjLENBQUNnQyxNQUFNLEdBQUdGLEtBQUssSUFBSW5CLFdBQVcsQ0FBQ3NCLEtBQUssQ0FBQ0gsS0FBSyxDQUFDLEMiLCJmaWxlIjoiL3BhY2thZ2VzL2RkcC1yYXRlLWxpbWl0ZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSYXRlTGltaXRlciB9IGZyb20gJ21ldGVvci9yYXRlLWxpbWl0JztcblxuLy8gUmF0ZSBMaW1pdGVyIGJ1aWx0IGludG8gRERQIHdpdGggYSBkZWZhdWx0IGVycm9yIG1lc3NhZ2UuIFNlZSBSRUFETUUgb3Jcbi8vIG9ubGluZSBkb2N1bWVudGF0aW9uIGZvciBtb3JlIGRldGFpbHMuXG5jb25zdCBERFBSYXRlTGltaXRlciA9IHt9O1xuXG5sZXQgZXJyb3JNZXNzYWdlID0gKHJhdGVMaW1pdFJlc3VsdCkgPT4ge1xuICByZXR1cm4gJ0Vycm9yLCB0b28gbWFueSByZXF1ZXN0cy4gUGxlYXNlIHNsb3cgZG93bi4gWW91IG11c3Qgd2FpdCAnICtcbiAgICBgJHtNYXRoLmNlaWwocmF0ZUxpbWl0UmVzdWx0LnRpbWVUb1Jlc2V0IC8gMTAwMCl9IHNlY29uZHMgYmVmb3JlIGAgK1xuICAgICd0cnlpbmcgYWdhaW4uJztcbn07XG5cbi8vIFN0b3JlIHJ1bGUgc3BlY2lmaWMgZXJyb3IgbWVzc2FnZXMuXG5jb25zdCBlcnJvck1lc3NhZ2VCeVJ1bGUgPSBuZXcgTWFwKCk7XG5cbmNvbnN0IHJhdGVMaW1pdGVyID0gbmV3IFJhdGVMaW1pdGVyKCk7XG5cbkREUFJhdGVMaW1pdGVyLmdldEVycm9yTWVzc2FnZSA9IChyYXRlTGltaXRSZXN1bHQpID0+IHtcbiAgLy8gSWYgdGhlcmUgaXMgYSBzcGVjaWZpYyBlcnJvciBtZXNzYWdlIGZvciB0aGlzIHJ1bGUsIHVzZSBpdC5cbiAgaWYgKGVycm9yTWVzc2FnZUJ5UnVsZS5oYXMocmF0ZUxpbWl0UmVzdWx0LnJ1bGVJZCkpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3JNZXNzYWdlQnlSdWxlLmdldChyYXRlTGltaXRSZXN1bHQucnVsZUlkKTtcbiAgICAvLyBpZiBpdCdzIGEgZnVuY3Rpb24sIHdlIG5lZWQgdG8gY2FsbCBpdFxuICAgIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgLy8gY2FsbCB0aGUgZnVuY3Rpb24gd2l0aCB0aGUgcmF0ZUxpbWl0UmVzdWx0XG4gICAgICByZXR1cm4gbWVzc2FnZShyYXRlTGltaXRSZXN1bHQpO1xuICAgIH1cbiAgICAvLyBvdGhlcndpc2UsIGp1c3QgcmV0dXJuIHRoZSBzdHJpbmdcbiAgICByZXR1cm4gbWVzc2FnZTtcbiB9XG5cbiAgLy8gT3RoZXJ3aXNlLCB1c2UgdGhlIGRlZmF1bHQgZXJyb3IgbWVzc2FnZS5cbiAgaWYgKHR5cGVvZiBlcnJvck1lc3NhZ2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gZXJyb3JNZXNzYWdlKHJhdGVMaW1pdFJlc3VsdCk7XG4gIH1cbiAgcmV0dXJuIGVycm9yTWVzc2FnZTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnkgU2V0IGVycm9yIG1lc3NhZ2UgdGV4dCB3aGVuIG1ldGhvZCBvciBzdWJzY3JpcHRpb24gcmF0ZSBsaW1pdFxuICogZXhjZWVkZWQuXG4gKiBAcGFyYW0ge3N0cmluZ3xmdW5jdGlvbn0gbWVzc2FnZSBGdW5jdGlvbnMgYXJlIHBhc3NlZCBpbiBhbiBvYmplY3Qgd2l0aCBhXG4gKiBgdGltZVRvUmVzZXRgIGZpZWxkIHRoYXQgc3BlY2lmaWVzIHRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHVudGlsIHRoZSBuZXh0XG4gKiBtZXRob2Qgb3Igc3Vic2NyaXB0aW9uIGlzIGFsbG93ZWQgdG8gcnVuLiBUaGUgZnVuY3Rpb24gbXVzdCByZXR1cm4gYSBzdHJpbmdcbiAqIG9mIHRoZSBlcnJvciBtZXNzYWdlLlxuICogQGxvY3VzIFNlcnZlclxuICovXG5ERFBSYXRlTGltaXRlci5zZXRFcnJvck1lc3NhZ2UgPSAobWVzc2FnZSkgPT4ge1xuICBlcnJvck1lc3NhZ2UgPSBtZXNzYWdlO1xufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBTZXQgZXJyb3IgbWVzc2FnZSB0ZXh0IHdoZW4gbWV0aG9kIG9yIHN1YnNjcmlwdGlvbiByYXRlIGxpbWl0XG4gKiBleGNlZWRlZCBmb3IgYSBzcGVjaWZpYyBydWxlLlxuICogQHBhcmFtIHtzdHJpbmd9IHJ1bGVJZCBUaGUgcnVsZUlkIHJldHVybmVkIGZyb20gYGFkZFJ1bGVgXG4gKiBAcGFyYW0ge3N0cmluZ3xmdW5jdGlvbn0gbWVzc2FnZSBGdW5jdGlvbnMgYXJlIHBhc3NlZCBpbiBhbiBvYmplY3Qgd2l0aCBhXG4gKiBgdGltZVRvUmVzZXRgIGZpZWxkIHRoYXQgc3BlY2lmaWVzIHRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHVudGlsIHRoZSBuZXh0XG4gKiBtZXRob2Qgb3Igc3Vic2NyaXB0aW9uIGlzIGFsbG93ZWQgdG8gcnVuLiBUaGUgZnVuY3Rpb24gbXVzdCByZXR1cm4gYSBzdHJpbmdcbiAqIG9mIHRoZSBlcnJvciBtZXNzYWdlLlxuICogQGxvY3VzIFNlcnZlclxuICovXG5ERFBSYXRlTGltaXRlci5zZXRFcnJvck1lc3NhZ2VPblJ1bGUgPSAocnVsZUlkLCBtZXNzYWdlKSA9PiB7XG4gIGVycm9yTWVzc2FnZUJ5UnVsZS5zZXQocnVsZUlkLCBtZXNzYWdlKTtcbn07XG5cbi8qKlxuICogQHN1bW1hcnlcbiAqIEFkZCBhIHJ1bGUgdGhhdCBtYXRjaGVzIGFnYWluc3QgYSBzdHJlYW0gb2YgZXZlbnRzIGRlc2NyaWJpbmcgbWV0aG9kIG9yXG4gKiBzdWJzY3JpcHRpb24gYXR0ZW1wdHMuIEVhY2ggZXZlbnQgaXMgYW4gb2JqZWN0IHdpdGggdGhlIGZvbGxvd2luZ1xuICogcHJvcGVydGllczpcbiAqXG4gKiAtIGB0eXBlYDogRWl0aGVyIFwibWV0aG9kXCIgb3IgXCJzdWJzY3JpcHRpb25cIlxuICogLSBgbmFtZWA6IFRoZSBuYW1lIG9mIHRoZSBtZXRob2Qgb3Igc3Vic2NyaXB0aW9uIGJlaW5nIGNhbGxlZFxuICogLSBgdXNlcklkYDogVGhlIHVzZXIgSUQgYXR0ZW1wdGluZyB0aGUgbWV0aG9kIG9yIHN1YnNjcmlwdGlvblxuICogLSBgY29ubmVjdGlvbklkYDogQSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSB1c2VyJ3MgRERQIGNvbm5lY3Rpb25cbiAqIC0gYGNsaWVudEFkZHJlc3NgOiBUaGUgSVAgYWRkcmVzcyBvZiB0aGUgdXNlclxuICpcbiAqIFJldHVybnMgdW5pcXVlIGBydWxlSWRgIHRoYXQgY2FuIGJlIHBhc3NlZCB0byBgcmVtb3ZlUnVsZWAuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG1hdGNoZXJcbiAqICAgTWF0Y2hlcnMgc3BlY2lmeSB3aGljaCBldmVudHMgYXJlIGNvdW50ZWQgdG93YXJkcyBhIHJhdGUgbGltaXQuIEEgbWF0Y2hlclxuICogICBpcyBhbiBvYmplY3QgdGhhdCBoYXMgYSBzdWJzZXQgb2YgdGhlIHNhbWUgcHJvcGVydGllcyBhcyB0aGUgZXZlbnQgb2JqZWN0c1xuICogICBkZXNjcmliZWQgYWJvdmUuIEVhY2ggdmFsdWUgaW4gYSBtYXRjaGVyIG9iamVjdCBpcyBvbmUgb2YgdGhlIGZvbGxvd2luZzpcbiAqXG4gKiAgIC0gYSBzdHJpbmc6IGZvciB0aGUgZXZlbnQgdG8gc2F0aXNmeSB0aGUgbWF0Y2hlciwgdGhpcyB2YWx1ZSBtdXN0IGJlIGVxdWFsXG4gKiAgIHRvIHRoZSB2YWx1ZSBvZiB0aGUgc2FtZSBwcm9wZXJ0eSBpbiB0aGUgZXZlbnQgb2JqZWN0XG4gKlxuICogICAtIGEgZnVuY3Rpb246IGZvciB0aGUgZXZlbnQgdG8gc2F0aXNmeSB0aGUgbWF0Y2hlciwgdGhlIGZ1bmN0aW9uIG11c3RcbiAqICAgZXZhbHVhdGUgdG8gdHJ1ZSB3aGVuIHBhc3NlZCB0aGUgdmFsdWUgb2YgdGhlIHNhbWUgcHJvcGVydHlcbiAqICAgaW4gdGhlIGV2ZW50IG9iamVjdFxuICpcbiAqIEhlcmUncyBob3cgZXZlbnRzIGFyZSBjb3VudGVkOiBFYWNoIGV2ZW50IHRoYXQgc2F0aXNmaWVzIHRoZSBtYXRjaGVyJ3NcbiAqIGZpbHRlciBpcyBtYXBwZWQgdG8gYSBidWNrZXQuIEJ1Y2tldHMgYXJlIHVuaXF1ZWx5IGRldGVybWluZWQgYnkgdGhlXG4gKiBldmVudCBvYmplY3QncyB2YWx1ZXMgZm9yIGFsbCBwcm9wZXJ0aWVzIHByZXNlbnQgaW4gYm90aCB0aGUgbWF0Y2hlciBhbmRcbiAqIGV2ZW50IG9iamVjdHMuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9IG51bVJlcXVlc3RzICBudW1iZXIgb2YgcmVxdWVzdHMgYWxsb3dlZCBwZXIgdGltZSBpbnRlcnZhbC5cbiAqIERlZmF1bHQgPSAxMC5cbiAqIEBwYXJhbSB7bnVtYmVyfSB0aW1lSW50ZXJ2YWwgdGltZSBpbnRlcnZhbCBpbiBtaWxsaXNlY29uZHMgYWZ0ZXIgd2hpY2hcbiAqIHJ1bGUncyBjb3VudGVycyBhcmUgcmVzZXQuIERlZmF1bHQgPSAxMDAwLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGFmdGVyIGEgcnVsZSBpcyBleGVjdXRlZC5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqL1xuRERQUmF0ZUxpbWl0ZXIuYWRkUnVsZSA9IChtYXRjaGVyLCBudW1SZXF1ZXN0cywgdGltZUludGVydmFsLCBjYWxsYmFjaykgPT4gXG4gIHJhdGVMaW1pdGVyLmFkZFJ1bGUobWF0Y2hlciwgbnVtUmVxdWVzdHMsIHRpbWVJbnRlcnZhbCwgY2FsbGJhY2spO1xuXG5ERFBSYXRlTGltaXRlci5wcmludFJ1bGVzID0gKCkgPT4gcmF0ZUxpbWl0ZXIucnVsZXM7XG5cbi8qKlxuICogQHN1bW1hcnkgUmVtb3ZlcyB0aGUgc3BlY2lmaWVkIHJ1bGUgZnJvbSB0aGUgcmF0ZSBsaW1pdGVyLiBJZiBydWxlIGhhZFxuICogaGl0IGEgcmF0ZSBsaW1pdCwgdGhhdCBsaW1pdCBpcyByZW1vdmVkIGFzIHdlbGwuXG4gKiBAcGFyYW0gIHtzdHJpbmd9IGlkICdydWxlSWQnIHJldHVybmVkIGZyb20gYGFkZFJ1bGVgXG4gKiBAcmV0dXJuIHtib29sZWFufSAgICBUcnVlIGlmIGEgcnVsZSB3YXMgcmVtb3ZlZC5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqL1xuRERQUmF0ZUxpbWl0ZXIucmVtb3ZlUnVsZSA9IGlkID0+IHJhdGVMaW1pdGVyLnJlbW92ZVJ1bGUoaWQpO1xuXG4vLyBUaGlzIGlzIGFjY2Vzc2VkIGluc2lkZSBsaXZlZGF0YV9zZXJ2ZXIuanMsIGJ1dCBzaG91bGRuJ3QgYmUgY2FsbGVkIGJ5IGFueVxuLy8gdXNlci5cbkREUFJhdGVMaW1pdGVyLl9pbmNyZW1lbnQgPSAoaW5wdXQpID0+IHtcbiAgcmF0ZUxpbWl0ZXIuaW5jcmVtZW50KGlucHV0KTtcbn07XG5cbkREUFJhdGVMaW1pdGVyLl9jaGVjayA9IGlucHV0ID0+IHJhdGVMaW1pdGVyLmNoZWNrKGlucHV0KTtcblxuZXhwb3J0IHsgRERQUmF0ZUxpbWl0ZXIgfTtcbiJdfQ==
