(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var options, callback, Hook;

var require = meteorInstall({"node_modules":{"meteor":{"callback-hook":{"hook.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                               //
// packages/callback-hook/hook.js                                                                //
//                                                                                               //
///////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                 //
module.export({
  Hook: () => Hook
});
// XXX This pattern is under development. Do not add more callsites
// using this package for now. See:
// https://meteor.hackpad.com/Design-proposal-Hooks-YxvgEW06q6f
//
// Encapsulates the pattern of registering callbacks on a hook.
//
// The `each` method of the hook calls its iterator function argument
// with each registered callback.  This allows the hook to
// conditionally decide not to call the callback (if, for example, the
// observed object has been closed or terminated).
//
// By default, callbacks are bound with `Meteor.bindEnvironment`, so they will be
// called with the Meteor environment of the calling code that
// registered the callback. Override by passing { bindEnvironment: false }
// to the constructor.
//
// Registering a callback returns an object with a single `stop`
// method which unregisters the callback.
//
// The code is careful to allow a callback to be safely unregistered
// while the callbacks are being iterated over.
//
// If the hook is configured with the `exceptionHandler` option, the
// handler will be called if a called callback throws an exception.
// By default (if the exception handler doesn't itself throw an
// exception, or if the iterator function doesn't return a falsy value
// to terminate the calling of callbacks), the remaining callbacks
// will still be called.
//
// Alternatively, the `debugPrintExceptions` option can be specified
// as string describing the callback.  On an exception the string and
// the exception will be printed to the console log with
// `Meteor._debug`, and the exception otherwise ignored.
//
// If an exception handler isn't specified, exceptions thrown in the
// callback will propagate up to the iterator function, and will
// terminate calling the remaining callbacks if not caught.

const hasOwn = Object.prototype.hasOwnProperty;
class Hook {
  constructor(options) {
    options = options || {};
    this.nextCallbackId = 0;
    this.callbacks = Object.create(null);
    // Whether to wrap callbacks with Meteor.bindEnvironment
    this.bindEnvironment = true;
    if (options.bindEnvironment === false) {
      this.bindEnvironment = false;
    }
    this.wrapAsync = true;
    if (options.wrapAsync === false) {
      this.wrapAsync = false;
    }
    if (options.exceptionHandler) {
      this.exceptionHandler = options.exceptionHandler;
    } else if (options.debugPrintExceptions) {
      if (typeof options.debugPrintExceptions !== "string") {
        throw new Error("Hook option debugPrintExceptions should be a string");
      }
      this.exceptionHandler = options.debugPrintExceptions;
    }
  }
  register(callback) {
    const exceptionHandler = this.exceptionHandler || function (exception) {
      // Note: this relies on the undocumented fact that if bindEnvironment's
      // onException throws, and you are invoking the callback either in the
      // browser or from within a Fiber in Node, the exception is propagated.
      throw exception;
    };
    if (this.bindEnvironment) {
      callback = Meteor.bindEnvironment(callback, exceptionHandler);
    } else {
      callback = dontBindEnvironment(callback, exceptionHandler);
    }
    if (this.wrapAsync) {
      callback = Meteor.wrapFn(callback);
    }
    const id = this.nextCallbackId++;
    this.callbacks[id] = callback;
    return {
      callback,
      stop: () => {
        delete this.callbacks[id];
      }
    };
  }
  clear() {
    this.nextCallbackId = 0;
    this.callbacks = [];
  }

  /**
   * For each registered callback, call the passed iterator function with the callback.
   *
   * The iterator function can choose whether or not to call the
   * callback.  (For example, it might not call the callback if the
   * observed object has been closed or terminated).
   * The iteration is stopped if the iterator function returns a falsy
   * value or throws an exception.
   *
   * @param iterator
   */
  forEach(iterator) {
    // Invoking bindEnvironment'd callbacks outside of a Fiber in Node doesn't
    // run them to completion (and exceptions thrown from onException are not
    // propagated), so we need to be in a Fiber.
    Meteor._nodeCodeMustBeInFiber();
    const ids = Object.keys(this.callbacks);
    for (let i = 0; i < ids.length; ++i) {
      const id = ids[i];
      // check to see if the callback was removed during iteration
      if (hasOwn.call(this.callbacks, id)) {
        const callback = this.callbacks[id];
        if (!iterator(callback)) {
          break;
        }
      }
    }
  }

  /**
   * For each registered callback, call the passed iterator function with the callback.
   *
   * it is a counterpart of forEach, but it is async and returns a promise
   * @param iterator
   * @return {Promise<void>}
   * @see forEach
   */
  forEachAsync(iterator) {
    return Promise.asyncApply(() => {
      const ids = Object.keys(this.callbacks);
      for (let i = 0; i < ids.length; ++i) {
        const id = ids[i];
        // check to see if the callback was removed during iteration
        if (hasOwn.call(this.callbacks, id)) {
          const callback = this.callbacks[id];
          if (!Promise.await(iterator(callback))) {
            break;
          }
        }
      }
    });
  }

  /**
   * @deprecated use forEach
   * @param iterator
   */
  each(iterator) {
    return this.forEach(iterator);
  }
}
// Copied from Meteor.bindEnvironment and removed all the env stuff.
function dontBindEnvironment(func, onException, _this) {
  if (!onException || typeof onException === 'string') {
    const description = onException || "callback of async function";
    onException = function (error) {
      Meteor._debug("Exception in " + description, error);
    };
  }
  return function () {
    let ret;
    try {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      ret = func.apply(_this, args);
    } catch (e) {
      onException(e);
    }
    return ret;
  };
}
///////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

var exports = require("/node_modules/meteor/callback-hook/hook.js");

/* Exports */
Package._define("callback-hook", exports, {
  Hook: Hook
});

})();

//# sourceURL=meteor://💻app/packages/callback-hook.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvY2FsbGJhY2staG9vay9ob29rLmpzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIkhvb2siLCJoYXNPd24iLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIm5leHRDYWxsYmFja0lkIiwiY2FsbGJhY2tzIiwiY3JlYXRlIiwiYmluZEVudmlyb25tZW50Iiwid3JhcEFzeW5jIiwiZXhjZXB0aW9uSGFuZGxlciIsImRlYnVnUHJpbnRFeGNlcHRpb25zIiwiRXJyb3IiLCJyZWdpc3RlciIsImNhbGxiYWNrIiwiZXhjZXB0aW9uIiwiTWV0ZW9yIiwiZG9udEJpbmRFbnZpcm9ubWVudCIsIndyYXBGbiIsImlkIiwic3RvcCIsImNsZWFyIiwiZm9yRWFjaCIsIml0ZXJhdG9yIiwiX25vZGVDb2RlTXVzdEJlSW5GaWJlciIsImlkcyIsImtleXMiLCJpIiwibGVuZ3RoIiwiY2FsbCIsImZvckVhY2hBc3luYyIsImVhY2giLCJmdW5jIiwib25FeGNlcHRpb24iLCJfdGhpcyIsImRlc2NyaXB0aW9uIiwiZXJyb3IiLCJfZGVidWciLCJyZXQiLCJhcmdzIiwiYXBwbHkiLCJlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQUEsTUFBTSxDQUFDQyxNQUFNLENBQUM7RUFBQ0MsSUFBSSxFQUFDLE1BQUlBO0FBQUksQ0FBQyxDQUFDO0FBQTlCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLE1BQU1DLE1BQU0sR0FBR0MsTUFBTSxDQUFDQyxTQUFT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LENBQ1gsZUFBZSxHQUFHRixXQUFXLEVBQzdCQyxLQUFLLENBQ047SUFDSCxDQUFDO0VBQ0g7RUFFQSxPQUFPLFlBQW1CO0lBQ3hCLElBQUlFLEdBQUc7SUFDUCxJQUFJO01BQUEsa0NBRmNDLElBQUk7UUFBSkEsSUFBSTtNQUFBO01BR3BCRCxHQUFHLEdBQUdOLElBQUksQ0FBQ1EsS0FBSyxDQUFDTixLQUFLLEVBQUVLLElBQUksQ0FBQztJQUMvQixDQUFDLENBQUMsT0FBT0UsQ0FBQyxFQUFFO01BQ1ZSLFdBQVcsQ0FBQ1EsQ0FBQyxDQUFDO0lBQ2hCO0lBQ0EsT0FBT0gsR0FBRztFQUNaLENBQUM7QUFDSCxDIiwiZmlsZSI6Ii9wYWNrYWdlcy9jYWxsYmFjay1ob29rLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLy8gWFhYIFRoaXMgcGF0dGVybiBpcyB1bmRlciBkZXZlbG9wbWVudC4gRG8gbm90IGFkZCBtb3JlIGNhbGxzaXRlc1xuLy8gdXNpbmcgdGhpcyBwYWNrYWdlIGZvciBub3cuIFNlZTpcbi8vIGh0dHBzOi8vbWV0ZW9yLmhhY2twYWQuY29tL0Rlc2lnbi1wcm9wb3NhbC1Ib29rcy1ZeHZnRVcwNnE2ZlxuLy9cbi8vIEVuY2Fwc3VsYXRlcyB0aGUgcGF0dGVybiBvZiByZWdpc3RlcmluZyBjYWxsYmFja3Mgb24gYSBob29rLlxuLy9cbi8vIFRoZSBgZWFjaGAgbWV0aG9kIG9mIHRoZSBob29rIGNhbGxzIGl0cyBpdGVyYXRvciBmdW5jdGlvbiBhcmd1bWVudFxuLy8gd2l0aCBlYWNoIHJlZ2lzdGVyZWQgY2FsbGJhY2suICBUaGlzIGFsbG93cyB0aGUgaG9vayB0b1xuLy8gY29uZGl0aW9uYWxseSBkZWNpZGUgbm90IHRvIGNhbGwgdGhlIGNhbGxiYWNrIChpZiwgZm9yIGV4YW1wbGUsIHRoZVxuLy8gb2JzZXJ2ZWQgb2JqZWN0IGhhcyBiZWVuIGNsb3NlZCBvciB0ZXJtaW5hdGVkKS5cbi8vXG4vLyBCeSBkZWZhdWx0LCBjYWxsYmFja3MgYXJlIGJvdW5kIHdpdGggYE1ldGVvci5iaW5kRW52aXJvbm1lbnRgLCBzbyB0aGV5IHdpbGwgYmVcbi8vIGNhbGxlZCB3aXRoIHRoZSBNZXRlb3IgZW52aXJvbm1lbnQgb2YgdGhlIGNhbGxpbmcgY29kZSB0aGF0XG4vLyByZWdpc3RlcmVkIHRoZSBjYWxsYmFjay4gT3ZlcnJpZGUgYnkgcGFzc2luZyB7IGJpbmRFbnZpcm9ubWVudDogZmFsc2UgfVxuLy8gdG8gdGhlIGNvbnN0cnVjdG9yLlxuLy9cbi8vIFJlZ2lzdGVyaW5nIGEgY2FsbGJhY2sgcmV0dXJucyBhbiBvYmplY3Qgd2l0aCBhIHNpbmdsZSBgc3RvcGBcbi8vIG1ldGhvZCB3aGljaCB1bnJlZ2lzdGVycyB0aGUgY2FsbGJhY2suXG4vL1xuLy8gVGhlIGNvZGUgaXMgY2FyZWZ1bCB0byBhbGxvdyBhIGNhbGxiYWNrIHRvIGJlIHNhZmVseSB1bnJlZ2lzdGVyZWRcbi8vIHdoaWxlIHRoZSBjYWxsYmFja3MgYXJlIGJlaW5nIGl0ZXJhdGVkIG92ZXIuXG4vL1xuLy8gSWYgdGhlIGhvb2sgaXMgY29uZmlndXJlZCB3aXRoIHRoZSBgZXhjZXB0aW9uSGFuZGxlcmAgb3B0aW9uLCB0aGVcbi8vIGhhbmRsZXIgd2lsbCBiZSBjYWxsZWQgaWYgYSBjYWxsZWQgY2FsbGJhY2sgdGhyb3dzIGFuIGV4Y2VwdGlvbi5cbi8vIEJ5IGRlZmF1bHQgKGlmIHRoZSBleGNlcHRpb24gaGFuZGxlciBkb2Vzbid0IGl0c2VsZiB0aHJvdyBhblxuLy8gZXhjZXB0aW9uLCBvciBpZiB0aGUgaXRlcmF0b3IgZnVuY3Rpb24gZG9lc24ndCByZXR1cm4gYSBmYWxzeSB2YWx1ZVxuLy8gdG8gdGVybWluYXRlIHRoZSBjYWxsaW5nIG9mIGNhbGxiYWNrcyksIHRoZSByZW1haW5pbmcgY2FsbGJhY2tzXG4vLyB3aWxsIHN0aWxsIGJlIGNhbGxlZC5cbi8vXG4vLyBBbHRlcm5hdGl2ZWx5LCB0aGUgYGRlYnVnUHJpbnRFeGNlcHRpb25zYCBvcHRpb24gY2FuIGJlIHNwZWNpZmllZFxuLy8gYXMgc3RyaW5nIGRlc2NyaWJpbmcgdGhlIGNhbGxiYWNrLiAgT24gYW4gZXhjZXB0aW9uIHRoZSBzdHJpbmcgYW5kXG4vLyB0aGUgZXhjZXB0aW9uIHdpbGwgYmUgcHJpbnRlZCB0byB0aGUgY29uc29sZSBsb2cgd2l0aFxuLy8gYE1ldGVvci5fZGVidWdgLCBhbmQgdGhlIGV4Y2VwdGlvbiBvdGhlcndpc2UgaWdub3JlZC5cbi8vXG4vLyBJZiBhbiBleGNlcHRpb24gaGFuZGxlciBpc24ndCBzcGVjaWZpZWQsIGV4Y2VwdGlvbnMgdGhyb3duIGluIHRoZVxuLy8gY2FsbGJhY2sgd2lsbCBwcm9wYWdhdGUgdXAgdG8gdGhlIGl0ZXJhdG9yIGZ1bmN0aW9uLCBhbmQgd2lsbFxuLy8gdGVybWluYXRlIGNhbGxpbmcgdGhlIHJlbWFpbmluZyBjYWxsYmFja3MgaWYgbm90IGNhdWdodC5cblxuY29uc3QgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuZXhwb3J0IGNsYXNzIEhvb2sge1xuICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdGhpcy5uZXh0Q2FsbGJhY2tJZCA9IDA7XG4gICAgdGhpcy5jYWxsYmFja3MgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIC8vIFdoZXRoZXIgdG8gd3JhcCBjYWxsYmFja3Mgd2l0aCBNZXRlb3IuYmluZEVudmlyb25tZW50XG4gICAgdGhpcy5iaW5kRW52aXJvbm1lbnQgPSB0cnVlO1xuICAgIGlmIChvcHRpb25zLmJpbmRFbnZpcm9ubWVudCA9PT0gZmFsc2UpIHtcbiAgICAgIHRoaXMuYmluZEVudmlyb25tZW50ID0gZmFsc2U7XG4gICAgfVxuXG4gICAgdGhpcy53cmFwQXN5bmMgPSB0cnVlO1xuICAgIGlmIChvcHRpb25zLndyYXBBc3luYyA9PT0gZmFsc2UpIHtcbiAgICAgIHRoaXMud3JhcEFzeW5jID0gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvbnMuZXhjZXB0aW9uSGFuZGxlcikge1xuICAgICAgdGhpcy5leGNlcHRpb25IYW5kbGVyID0gb3B0aW9ucy5leGNlcHRpb25IYW5kbGVyO1xuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5kZWJ1Z1ByaW50RXhjZXB0aW9ucykge1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlYnVnUHJpbnRFeGNlcHRpb25zICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkhvb2sgb3B0aW9uIGRlYnVnUHJpbnRFeGNlcHRpb25zIHNob3VsZCBiZSBhIHN0cmluZ1wiKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuZXhjZXB0aW9uSGFuZGxlciA9IG9wdGlvbnMuZGVidWdQcmludEV4Y2VwdGlvbnM7XG4gICAgfVxuICB9XG5cbiAgcmVnaXN0ZXIoY2FsbGJhY2spIHtcbiAgICBjb25zdCBleGNlcHRpb25IYW5kbGVyID0gdGhpcy5leGNlcHRpb25IYW5kbGVyIHx8IGZ1bmN0aW9uIChleGNlcHRpb24pIHtcbiAgICAgIC8vIE5vdGU6IHRoaXMgcmVsaWVzIG9uIHRoZSB1bmRvY3VtZW50ZWQgZmFjdCB0aGF0IGlmIGJpbmRFbnZpcm9ubWVudCdzXG4gICAgICAvLyBvbkV4Y2VwdGlvbiB0aHJvd3MsIGFuZCB5b3UgYXJlIGludm9raW5nIHRoZSBjYWxsYmFjayBlaXRoZXIgaW4gdGhlXG4gICAgICAvLyBicm93c2VyIG9yIGZyb20gd2l0aGluIGEgRmliZXIgaW4gTm9kZSwgdGhlIGV4Y2VwdGlvbiBpcyBwcm9wYWdhdGVkLlxuICAgICAgdGhyb3cgZXhjZXB0aW9uO1xuICAgIH07XG5cbiAgICBpZiAodGhpcy5iaW5kRW52aXJvbm1lbnQpIHtcbiAgICAgIGNhbGxiYWNrID0gTWV0ZW9yLmJpbmRFbnZpcm9ubWVudChjYWxsYmFjaywgZXhjZXB0aW9uSGFuZGxlcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbGxiYWNrID0gZG9udEJpbmRFbnZpcm9ubWVudChjYWxsYmFjaywgZXhjZXB0aW9uSGFuZGxlcik7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMud3JhcEFzeW5jKSB7XG4gICAgICBjYWxsYmFjayA9IE1ldGVvci53cmFwRm4oY2FsbGJhY2spO1xuICAgIH1cblxuICAgIGNvbnN0IGlkID0gdGhpcy5uZXh0Q2FsbGJhY2tJZCsrO1xuICAgIHRoaXMuY2FsbGJhY2tzW2lkXSA9IGNhbGxiYWNrO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbGxiYWNrLFxuICAgICAgc3RvcDogKCkgPT4ge1xuICAgICAgICBkZWxldGUgdGhpcy5jYWxsYmFja3NbaWRdO1xuICAgICAgfVxuICAgIH07XG4gIH1cblxuICBjbGVhcigpIHtcbiAgICB0aGlzLm5leHRDYWxsYmFja0lkID0gMDtcbiAgICB0aGlzLmNhbGxiYWNrcyA9IFtdO1xuICB9XG5cbiAgLyoqXG4gICAqIEZvciBlYWNoIHJlZ2lzdGVyZWQgY2FsbGJhY2ssIGNhbGwgdGhlIHBhc3NlZCBpdGVyYXRvciBmdW5jdGlvbiB3aXRoIHRoZSBjYWxsYmFjay5cbiAgICpcbiAgICogVGhlIGl0ZXJhdG9yIGZ1bmN0aW9uIGNhbiBjaG9vc2Ugd2hldGhlciBvciBub3QgdG8gY2FsbCB0aGVcbiAgICogY2FsbGJhY2suICAoRm9yIGV4YW1wbGUsIGl0IG1pZ2h0IG5vdCBjYWxsIHRoZSBjYWxsYmFjayBpZiB0aGVcbiAgICogb2JzZXJ2ZWQgb2JqZWN0IGhhcyBiZWVuIGNsb3NlZCBvciB0ZXJtaW5hdGVkKS5cbiAgICogVGhlIGl0ZXJhdGlvbiBpcyBzdG9wcGVkIGlmIHRoZSBpdGVyYXRvciBmdW5jdGlvbiByZXR1cm5zIGEgZmFsc3lcbiAgICogdmFsdWUgb3IgdGhyb3dzIGFuIGV4Y2VwdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIGl0ZXJhdG9yXG4gICAqL1xuICBmb3JFYWNoKGl0ZXJhdG9yKSB7XG4gICAgLy8gSW52b2tpbmcgYmluZEVudmlyb25tZW50J2QgY2FsbGJhY2tzIG91dHNpZGUgb2YgYSBGaWJlciBpbiBOb2RlIGRvZXNuJ3RcbiAgICAvLyBydW4gdGhlbSB0byBjb21wbGV0aW9uIChhbmQgZXhjZXB0aW9ucyB0aHJvd24gZnJvbSBvbkV4Y2VwdGlvbiBhcmUgbm90XG4gICAgLy8gcHJvcGFnYXRlZCksIHNvIHdlIG5lZWQgdG8gYmUgaW4gYSBGaWJlci5cbiAgICBNZXRlb3IuX25vZGVDb2RlTXVzdEJlSW5GaWJlcigpO1xuXG4gICAgY29uc3QgaWRzID0gT2JqZWN0LmtleXModGhpcy5jYWxsYmFja3MpO1xuICAgIGZvciAobGV0IGkgPSAwOyAgaSA8IGlkcy5sZW5ndGg7ICArK2kpIHtcbiAgICAgIGNvbnN0IGlkID0gaWRzW2ldO1xuICAgICAgLy8gY2hlY2sgdG8gc2VlIGlmIHRoZSBjYWxsYmFjayB3YXMgcmVtb3ZlZCBkdXJpbmcgaXRlcmF0aW9uXG4gICAgICBpZiAoaGFzT3duLmNhbGwodGhpcy5jYWxsYmFja3MsIGlkKSkge1xuICAgICAgICBjb25zdCBjYWxsYmFjayA9IHRoaXMuY2FsbGJhY2tzW2lkXTtcbiAgICAgICAgaWYgKCEgaXRlcmF0b3IoY2FsbGJhY2spKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRm9yIGVhY2ggcmVnaXN0ZXJlZCBjYWxsYmFjaywgY2FsbCB0aGUgcGFzc2VkIGl0ZXJhdG9yIGZ1bmN0aW9uIHdpdGggdGhlIGNhbGxiYWNrLlxuICAgKlxuICAgKiBpdCBpcyBhIGNvdW50ZXJwYXJ0IG9mIGZvckVhY2gsIGJ1dCBpdCBpcyBhc3luYyBhbmQgcmV0dXJucyBhIHByb21pc2VcbiAgICogQHBhcmFtIGl0ZXJhdG9yXG4gICAqIEByZXR1cm4ge1Byb21pc2U8dm9pZD59XG4gICAqIEBzZWUgZm9yRWFjaFxuICAgKi9cbiAgYXN5bmMgZm9yRWFjaEFzeW5jKGl0ZXJhdG9yKSB7XG4gICAgY29uc3QgaWRzID0gT2JqZWN0LmtleXModGhpcy5jYWxsYmFja3MpO1xuICAgIGZvciAobGV0IGkgPSAwOyAgaSA8IGlkcy5sZW5ndGg7ICArK2kpIHtcbiAgICAgIGNvbnN0IGlkID0gaWRzW2ldO1xuICAgICAgLy8gY2hlY2sgdG8gc2VlIGlmIHRoZSBjYWxsYmFjayB3YXMgcmVtb3ZlZCBkdXJpbmcgaXRlcmF0aW9uXG4gICAgICBpZiAoaGFzT3duLmNhbGwodGhpcy5jYWxsYmFja3MsIGlkKSkge1xuICAgICAgICBjb25zdCBjYWxsYmFjayA9IHRoaXMuY2FsbGJhY2tzW2lkXTtcbiAgICAgICAgaWYgKCFhd2FpdCBpdGVyYXRvcihjYWxsYmFjaykpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAZGVwcmVjYXRlZCB1c2UgZm9yRWFjaFxuICAgKiBAcGFyYW0gaXRlcmF0b3JcbiAgICovXG4gIGVhY2goaXRlcmF0b3IpIHtcbiAgICByZXR1cm4gdGhpcy5mb3JFYWNoKGl0ZXJhdG9yKTtcbiAgfVxufVxuXG4vLyBDb3BpZWQgZnJvbSBNZXRlb3IuYmluZEVudmlyb25tZW50IGFuZCByZW1vdmVkIGFsbCB0aGUgZW52IHN0dWZmLlxuZnVuY3Rpb24gZG9udEJpbmRFbnZpcm9ubWVudChmdW5jLCBvbkV4Y2VwdGlvbiwgX3RoaXMpIHtcbiAgaWYgKCFvbkV4Y2VwdGlvbiB8fCB0eXBlb2Yob25FeGNlcHRpb24pID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gb25FeGNlcHRpb24gfHwgXCJjYWxsYmFjayBvZiBhc3luYyBmdW5jdGlvblwiO1xuICAgIG9uRXhjZXB0aW9uID0gZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICBNZXRlb3IuX2RlYnVnKFxuICAgICAgICBcIkV4Y2VwdGlvbiBpbiBcIiArIGRlc2NyaXB0aW9uLFxuICAgICAgICBlcnJvclxuICAgICAgKTtcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gICAgbGV0IHJldDtcbiAgICB0cnkge1xuICAgICAgcmV0ID0gZnVuYy5hcHBseShfdGhpcywgYXJncyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgb25FeGNlcHRpb24oZSk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH07XG59XG4iXX0=
