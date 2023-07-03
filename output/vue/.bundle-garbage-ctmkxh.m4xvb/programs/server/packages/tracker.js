(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Tracker, Deps, computation;

var require = meteorInstall({"node_modules":{"meteor":{"tracker":{"tracker.js":function module(){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                    //
// packages/tracker/tracker.js                                                                                        //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                      //
/////////////////////////////////////////////////////
// Package docs at http://docs.meteor.com/#tracker //
/////////////////////////////////////////////////////

/**
 * @namespace Tracker
 * @summary The namespace for Tracker-related methods.
 */
Tracker = {};

/**
 * @namespace Deps
 * @deprecated
 */
Deps = Tracker;

// http://docs.meteor.com/#tracker_active

/**
 * @summary True if there is a current computation, meaning that dependencies on reactive data sources will be tracked and potentially cause the current computation to be rerun.
 * @locus Client
 * @type {Boolean}
 */
Tracker.active = false;

// http://docs.meteor.com/#tracker_currentcomputation

/**
 * @summary The current computation, or `null` if there isn't one.  The current computation is the [`Tracker.Computation`](#tracker_computation) object created by the innermost active call to `Tracker.autorun`, and it's the computation that gains dependencies when reactive data sources are accessed.
 * @locus Client
 * @type {Tracker.Computation}
 */
Tracker.currentComputation = null;
function _debugFunc() {
  // We want this code to work without Meteor, and also without
  // "console" (which is technically non-standard and may be missing
  // on some browser we come across, like it was on IE 7).
  //
  // Lazy evaluation because `Meteor` does not exist right away.(??)
  return typeof Meteor !== "undefined" ? Meteor._debug : typeof console !== "undefined" && console.error ? function () {
    console.error.apply(console, arguments);
  } : function () {};
}
function _maybeSuppressMoreLogs(messagesLength) {
  // Sometimes when running tests, we intentionally suppress logs on expected
  // printed errors. Since the current implementation of _throwOrLog can log
  // multiple separate log messages, suppress all of them if at least one suppress
  // is expected as we still want them to count as one.
  if (typeof Meteor !== "undefined") {
    if (Meteor._suppressed_log_expected()) {
      Meteor._suppress_log(messagesLength - 1);
    }
  }
}
function _throwOrLog(from, e) {
  if (throwFirstError) {
    throw e;
  } else {
    var printArgs = ["Exception from Tracker " + from + " function:"];
    if (e.stack && e.message && e.name) {
      var idx = e.stack.indexOf(e.message);
      if (idx < 0 || idx > e.name.length + 2) {
        // check for "Error: "
        // message is not part of the stack
        var message = e.name + ": " + e.message;
        printArgs.push(message);
      }
    }
    printArgs.push(e.stack);
    _maybeSuppressMoreLogs(printArgs.length);
    for (var i = 0; i < printArgs.length; i++) {
      _debugFunc()(printArgs[i]);
    }
  }
}

// Takes a function `f`, and wraps it in a `Meteor._noYieldsAllowed`
// block if we are running on the server. On the client, returns the
// original function (since `Meteor._noYieldsAllowed` is a
// no-op). This has the benefit of not adding an unnecessary stack
// frame on the client.
function withNoYieldsAllowed(f) {
  if (typeof Meteor === 'undefined' || Meteor.isClient) {
    return f;
  } else {
    return function () {
      var args = arguments;
      Meteor._noYieldsAllowed(function () {
        f.apply(null, args);
      });
    };
  }
}
var nextId = 1;
// computations whose callbacks we should call at flush time
var pendingComputations = [];
// `true` if a Tracker.flush is scheduled, or if we are in Tracker.flush now
var willFlush = false;
// `true` if we are in Tracker.flush now
var inFlush = false;
// `true` if we are computing a computation now, either first time
// or recompute.  This matches Tracker.active unless we are inside
// Tracker.nonreactive, which nullfies currentComputation even though
// an enclosing computation may still be running.
var inCompute = false;
// `true` if the `_throwFirstError` option was passed in to the call
// to Tracker.flush that we are in. When set, throw rather than log the
// first error encountered while flushing. Before throwing the error,
// finish flushing (from a finally block), logging any subsequent
// errors.
var throwFirstError = false;
var afterFlushCallbacks = [];
function requireFlush() {
  if (!willFlush) {
    // We want this code to work without Meteor, see debugFunc above
    if (typeof Meteor !== "undefined") Meteor._setImmediate(Tracker._runFlush);else setTimeout(Tracker._runFlush, 0);
    willFlush = true;
  }
}

// Tracker.Computation constructor is visible but private
// (throws an error if you try to call it)
var constructingComputation = false;

//
// http://docs.meteor.com/#tracker_computation

/**
 * @summary A Computation object represents code that is repeatedly rerun
 * in response to
 * reactive data changes. Computations don't have return values; they just
 * perform actions, such as rerendering a template on the screen. Computations
 * are created using Tracker.autorun. Use stop to prevent further rerunning of a
 * computation.
 * @instancename computation
 */
Tracker.Computation = class Computation {
  constructor(f, parent, onError) {
    if (!constructingComputation) throw new Error("Tracker.Computation constructor is private; use Tracker.autorun");
    constructingComputation = false;

    // http://docs.meteor.com/#computation_stopped

    /**
     * @summary True if this computation has been stopped.
     * @locus Client
     * @memberOf Tracker.Computation
     * @instance
     * @name  stopped
     */
    this.stopped = false;

    // http://docs.meteor.com/#computation_invalidated

    /**
     * @summary True if this computation has been invalidated (and not yet rerun), or if it has been stopped.
     * @locus Client
     * @memberOf Tracker.Computation
     * @instance
     * @name  invalidated
     * @type {Boolean}
     */
    this.invalidated = false;

    // http://docs.meteor.com/#computation_firstrun

    /**
     * @summary True during the initial run of the computation at the time `Tracker.autorun` is called, and false on subsequent reruns and at other times.
     * @locus Client
     * @memberOf Tracker.Computation
     * @instance
     * @name  firstRun
     * @type {Boolean}
     */
    this.firstRun = true;
    this._id = nextId++;
    this._onInvalidateCallbacks = [];
    this._onStopCallbacks = [];
    // the plan is at some point to use the parent relation
    // to constrain the order that computations are processed
    this._parent = parent;
    this._func = f;
    this._onError = onError;
    this._recomputing = false;
    var errored = true;
    try {
      this._compute();
      errored = false;
    } finally {
      this.firstRun = false;
      if (errored) this.stop();
    }
  }

  // http://docs.meteor.com/#computation_oninvalidate

  /**
   * @summary Registers `callback` to run when this computation is next invalidated, or runs it immediately if the computation is already invalidated.  The callback is run exactly once and not upon future invalidations unless `onInvalidate` is called again after the computation becomes valid again.
   * @locus Client
   * @param {Function} callback Function to be called on invalidation. Receives one argument, the computation that was invalidated.
   */
  onInvalidate(f) {
    if (typeof f !== 'function') throw new Error("onInvalidate requires a function");
    if (this.invalidated) {
      Tracker.nonreactive(() => {
        withNoYieldsAllowed(f)(this);
      });
    } else {
      this._onInvalidateCallbacks.push(f);
    }
  }

  /**
   * @summary Registers `callback` to run when this computation is stopped, or runs it immediately if the computation is already stopped.  The callback is run after any `onInvalidate` callbacks.
   * @locus Client
   * @param {Function} callback Function to be called on stop. Receives one argument, the computation that was stopped.
   */
  onStop(f) {
    if (typeof f !== 'function') throw new Error("onStop requires a function");
    if (this.stopped) {
      Tracker.nonreactive(() => {
        withNoYieldsAllowed(f)(this);
      });
    } else {
      this._onStopCallbacks.push(f);
    }
  }

  // http://docs.meteor.com/#computation_invalidate

  /**
   * @summary Invalidates this computation so that it will be rerun.
   * @locus Client
   */
  invalidate() {
    if (!this.invalidated) {
      // if we're currently in _recompute(), don't enqueue
      // ourselves, since we'll rerun immediately anyway.
      if (!this._recomputing && !this.stopped) {
        requireFlush();
        pendingComputations.push(this);
      }
      this.invalidated = true;

      // callbacks can't add callbacks, because
      // this.invalidated === true.
      for (var i = 0, f; f = this._onInvalidateCallbacks[i]; i++) {
        Tracker.nonreactive(() => {
          withNoYieldsAllowed(f)(this);
        });
      }
      this._onInvalidateCallbacks = [];
    }
  }

  // http://docs.meteor.com/#computation_stop

  /**
   * @summary Prevents this computation from rerunning.
   * @locus Client
   */
  stop() {
    if (!this.stopped) {
      this.stopped = true;
      this.invalidate();
      for (var i = 0, f; f = this._onStopCallbacks[i]; i++) {
        Tracker.nonreactive(() => {
          withNoYieldsAllowed(f)(this);
        });
      }
      this._onStopCallbacks = [];
    }
  }
  _compute() {
    this.invalidated = false;
    var previousInCompute = inCompute;
    inCompute = true;
    try {
      Tracker.withComputation(this, () => {
        withNoYieldsAllowed(this._func)(this);
      });
    } finally {
      inCompute = previousInCompute;
    }
  }
  _needsRecompute() {
    return this.invalidated && !this.stopped;
  }
  _recompute() {
    this._recomputing = true;
    try {
      if (this._needsRecompute()) {
        try {
          this._compute();
        } catch (e) {
          if (this._onError) {
            this._onError(e);
          } else {
            _throwOrLog("recompute", e);
          }
        }
      }
    } finally {
      this._recomputing = false;
    }
  }

  /**
   * @summary Process the reactive updates for this computation immediately
   * and ensure that the computation is rerun. The computation is rerun only
   * if it is invalidated.
   * @locus Client
   */
  flush() {
    if (this._recomputing) return;
    this._recompute();
  }

  /**
   * @summary Causes the function inside this computation to run and
   * synchronously process all reactive updtes.
   * @locus Client
   */
  run() {
    this.invalidate();
    this.flush();
  }
};

//
// http://docs.meteor.com/#tracker_dependency

/**
 * @summary A Dependency represents an atomic unit of reactive data that a
 * computation might depend on. Reactive data sources such as Session or
 * Minimongo internally create different Dependency objects for different
 * pieces of data, each of which may be depended on by multiple computations.
 * When the data changes, the computations are invalidated.
 * @class
 * @instanceName dependency
 */
Tracker.Dependency = class Dependency {
  constructor() {
    this._dependentsById = Object.create(null);
  }

  // http://docs.meteor.com/#dependency_depend
  //
  // Adds `computation` to this set if it is not already
  // present.  Returns true if `computation` is a new member of the set.
  // If no argument, defaults to currentComputation, or does nothing
  // if there is no currentComputation.

  /**
   * @summary Declares that the current computation (or `fromComputation` if given) depends on `dependency`.  The computation will be invalidated the next time `dependency` changes.
    If there is no current computation and `depend()` is called with no arguments, it does nothing and returns false.
    Returns true if the computation is a new dependent of `dependency` rather than an existing one.
   * @locus Client
   * @param {Tracker.Computation} [fromComputation] An optional computation declared to depend on `dependency` instead of the current computation.
   * @returns {Boolean}
   */
  depend(computation) {
    if (!computation) {
      if (!Tracker.active) return false;
      computation = Tracker.currentComputation;
    }
    var id = computation._id;
    if (!(id in this._dependentsById)) {
      this._dependentsById[id] = computation;
      computation.onInvalidate(() => {
        delete this._dependentsById[id];
      });
      return true;
    }
    return false;
  }

  // http://docs.meteor.com/#dependency_changed

  /**
   * @summary Invalidate all dependent computations immediately and remove them as dependents.
   * @locus Client
   */
  changed() {
    for (var id in this._dependentsById) this._dependentsById[id].invalidate();
  }

  // http://docs.meteor.com/#dependency_hasdependents

  /**
   * @summary True if this Dependency has one or more dependent Computations, which would be invalidated if this Dependency were to change.
   * @locus Client
   * @returns {Boolean}
   */
  hasDependents() {
    for (var id in this._dependentsById) return true;
    return false;
  }
};

// http://docs.meteor.com/#tracker_flush

/**
 * @summary Process all reactive updates immediately and ensure that all invalidated computations are rerun.
 * @locus Client
 */
Tracker.flush = function (options) {
  Tracker._runFlush({
    finishSynchronously: true,
    throwFirstError: options && options._throwFirstError
  });
};

/**
 * @summary True if we are computing a computation now, either first time or recompute.  This matches Tracker.active unless we are inside Tracker.nonreactive, which nullfies currentComputation even though an enclosing computation may still be running.
 * @locus Client
 * @returns {Boolean}
 */
Tracker.inFlush = function () {
  return inFlush;
};

// Run all pending computations and afterFlush callbacks.  If we were not called
// directly via Tracker.flush, this may return before they're all done to allow
// the event loop to run a little before continuing.
Tracker._runFlush = function (options) {
  // XXX What part of the comment below is still true? (We no longer
  // have Spark)
  //
  // Nested flush could plausibly happen if, say, a flush causes
  // DOM mutation, which causes a "blur" event, which runs an
  // app event handler that calls Tracker.flush.  At the moment
  // Spark blocks event handlers during DOM mutation anyway,
  // because the LiveRange tree isn't valid.  And we don't have
  // any useful notion of a nested flush.
  //
  // https://app.asana.com/0/159908330244/385138233856
  if (Tracker.inFlush()) throw new Error("Can't call Tracker.flush while flushing");
  if (inCompute) throw new Error("Can't flush inside Tracker.autorun");
  options = options || {};
  inFlush = true;
  willFlush = true;
  throwFirstError = !!options.throwFirstError;
  var recomputedCount = 0;
  var finishedTry = false;
  try {
    while (pendingComputations.length || afterFlushCallbacks.length) {
      // recompute all pending computations
      while (pendingComputations.length) {
        var comp = pendingComputations.shift();
        comp._recompute();
        if (comp._needsRecompute()) {
          pendingComputations.unshift(comp);
        }
        if (!options.finishSynchronously && ++recomputedCount > 1000) {
          finishedTry = true;
          return;
        }
      }
      if (afterFlushCallbacks.length) {
        // call one afterFlush callback, which may
        // invalidate more computations
        var func = afterFlushCallbacks.shift();
        try {
          func();
        } catch (e) {
          _throwOrLog("afterFlush", e);
        }
      }
    }
    finishedTry = true;
  } finally {
    if (!finishedTry) {
      // we're erroring due to throwFirstError being true.
      inFlush = false; // needed before calling `Tracker.flush()` again
      // finish flushing
      Tracker._runFlush({
        finishSynchronously: options.finishSynchronously,
        throwFirstError: false
      });
    }
    willFlush = false;
    inFlush = false;
    if (pendingComputations.length || afterFlushCallbacks.length) {
      // We're yielding because we ran a bunch of computations and we aren't
      // required to finish synchronously, so we'd like to give the event loop a
      // chance. We should flush again soon.
      if (options.finishSynchronously) {
        throw new Error("still have more to do?"); // shouldn't happen
      }

      setTimeout(requireFlush, 10);
    }
  }
};

// http://docs.meteor.com/#tracker_autorun
//
// Run f(). Record its dependencies. Rerun it whenever the
// dependencies change.
//
// Returns a new Computation, which is also passed to f.
//
// Links the computation to the current computation
// so that it is stopped if the current computation is invalidated.

/**
 * @callback Tracker.ComputationFunction
 * @param {Tracker.Computation}
 */
/**
 * @summary Run a function now and rerun it later whenever its dependencies
 * change. Returns a Computation object that can be used to stop or observe the
 * rerunning.
 * @locus Client
 * @param {Tracker.ComputationFunction} runFunc The function to run. It receives
 * one argument: the Computation object that will be returned.
 * @param {Object} [options]
 * @param {Function} options.onError Optional. The function to run when an error
 * happens in the Computation. The only argument it receives is the Error
 * thrown. Defaults to the error being logged to the console.
 * @returns {Tracker.Computation}
 */
Tracker.autorun = function (f, options) {
  if (typeof f !== 'function') throw new Error('Tracker.autorun requires a function argument');
  options = options || {};
  constructingComputation = true;
  var c = new Tracker.Computation(f, Tracker.currentComputation, options.onError);
  if (Tracker.active) Tracker.onInvalidate(function () {
    c.stop();
  });
  return c;
};

// http://docs.meteor.com/#tracker_nonreactive
//
// Run `f` with no current computation, returning the return value
// of `f`.  Used to turn off reactivity for the duration of `f`,
// so that reactive data sources accessed by `f` will not result in any
// computations being invalidated.

/**
 * @summary Run a function without tracking dependencies.
 * @locus Client
 * @param {Function} func A function to call immediately.
 */
Tracker.nonreactive = function (f) {
  return Tracker.withComputation(null, f);
};

/**
 * @summary Helper function to make the tracker work with promises.
 * @param computation Computation that tracked
 * @param func async function that needs to be called and be reactive
 */
Tracker.withComputation = function (computation, f) {
  var previousComputation = Tracker.currentComputation;
  Tracker.currentComputation = computation;
  Tracker.active = !!computation;
  try {
    return f();
  } finally {
    Tracker.currentComputation = previousComputation;
    Tracker.active = !!previousComputation;
  }
};

// http://docs.meteor.com/#tracker_oninvalidate

/**
 * @summary Registers a new [`onInvalidate`](#computation_oninvalidate) callback on the current computation (which must exist), to be called immediately when the current computation is invalidated or stopped.
 * @locus Client
 * @param {Function} callback A callback function that will be invoked as `func(c)`, where `c` is the computation on which the callback is registered.
 */
Tracker.onInvalidate = function (f) {
  if (!Tracker.active) throw new Error("Tracker.onInvalidate requires a currentComputation");
  Tracker.currentComputation.onInvalidate(f);
};

// http://docs.meteor.com/#tracker_afterflush

/**
 * @summary Schedules a function to be called during the next flush, or later in the current flush if one is in progress, after all invalidated computations have been rerun.  The function will be run once and not on subsequent flushes unless `afterFlush` is called again.
 * @locus Client
 * @param {Function} callback A function to call at flush time.
 */
Tracker.afterFlush = function (f) {
  afterFlushCallbacks.push(f);
  requireFlush();
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

require("/node_modules/meteor/tracker/tracker.js");

/* Exports */
Package._define("tracker", {
  Tracker: Tracker,
  Deps: Deps
});

})();

//# sourceURL=meteor://💻app/packages/tracker.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIl0sIm5hbWVzIjpbIlRyYWNrZXIiLCJEZXBzIiwiYWN0aXZlIiwiY3VycmVudENvbXB1dGF0aW9uIiwiX2RlYnVnRnVuYyIsIk1ldGVvciIsIl9kZWJ1ZyIsImNvbnNvbGUiLCJlcnJvciIsImFwcGx5IiwiYXJndW1lbnRzIiwiX21heWJlU3VwcHJlc3NNb3JlTG9ncyIsIm1lc3NhZ2VzTGVuZ3RoIiwiX3N1cHByZXNzZWRfbG9nX2V4cGVjdGVkIiwiX3N1cHByZXNzX2xvZyIsIl90aHJvd09yTG9nIiwiZnJvbSIsImUiLCJ0aHJvd0ZpcnN0RXJyb3IiLCJwcmludEFyZ3MiLCJzdGFjayIsIm1lc3NhZ2UiLCJuYW1lIiwiaWR4IiwiaW5kZXhPZiIsImxlbmd0aCIsInB1c2giLCJpIiwid2l0aE5vWWllbGRzQWxsb3dlZCIsImYiLCJpc0NsaWVudCIsImFyZ3MiLCJfbm9ZaWVsZHNBbGxvd2VkIiwibmV4dElkIiwicGVuZGluZ0NvbXB1dGF0aW9ucyIsIndpbGxGbHVzaCIsImluRmx1c2giLCJpbkNvbXB1dGUiLCJhZnRlckZsdXNoQ2FsbGJhY2tzIiwicmVxdWlyZUZsdXNoIiwiX3NldEltbWVkaWF0ZSIsIl9ydW5GbHVzaCIsInNldFRpbWVvdXQiLCJjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiIsIkNvbXB1dGF0aW9uIiwiY29uc3RydWN0b3IiLCJwYXJlbnQiLCJvbkVycm9yIiwiRXJyb3IiLCJzdG9wcGVkIiwiaW52YWxpZGF0ZWQiLCJmaXJzdFJ1biIsIl9pZCIsIl9vbkludmFsaWRhdGVDYWxsYmFja3MiLCJfb25TdG9wQ2FsbGJhY2tzIiwiX3BhcmVudCIsIl9mdW5jIiwiX29uRXJyb3IiLCJfcmVjb21wdXRpbmciLCJlcnJvcmVkIiwiX2NvbXB1dGUiLCJzdG9wIiwib25JbnZhbGlkYXRlIiwibm9ucmVhY3RpdmUiLCJvblN0b3AiLCJpbnZhbGlkYXRlIiwicHJldmlvdXNJbkNvbXB1dGUiLCJ3aXRoQ29tcHV0YXRpb24iLCJfbmVlZHNSZWNvbXB1dGUiLCJfcmVjb21wdXRlIiwiZmx1c2giLCJydW4iLCJEZXBlbmRlbmN5IiwiX2RlcGVuZGVudHNCeUlkIiwiT2JqZWN0IiwiY3JlYXRlIiwiZGVwZW5kIiwiY29tcHV0YXRpb24iLCJpZCIsImNoYW5nZWQiLCJoYXNEZXBlbmRlbnRzIiwib3B0aW9ucyIsImZpbmlzaFN5bmNocm9ub3VzbHkiLCJfdGhyb3dGaXJzdEVycm9yIiwicmVjb21wdXRlZENvdW50IiwiZmluaXNoZWRUcnkiLCJjb21wIiwic2hpZnQiLCJ1bnNoaWZ0IiwiZnVuYyIsImF1dG9ydW4iLCJjIiwicHJldmlvdXNDb21wdXRhdGlvbiIsImFmdGVyRmx1c2giXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBQSxPQUFPLEdBQUcsQ0FBQyxDQUFDOztBQUVaO0FBQ0E7QUFDQTtBQUNBO0FBQ0FDLElBQUksR0FBR0QsT0FBTzs7QUFFZDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0FBLE9BQU8sQ0FBQ0UsTUFBTSxHQUFHLEtBQUs7O0FBRXRCOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQUYsT0FBTyxDQUFDRyxrQkFBa0IsR0FBRyxJQUFJO0FBRWpDLFNBQVNDLFVBQVUsR0FBRztFQUNwQjtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0EsT0FBUSxPQUFPQyxNQUFNLEtBQUssV0FBVyxHQUFHQSxNQUFNLENBQUNDLE1BQU0sR0FDM0MsT0FBT0MsT0FBTyxLQUFLLFdBQVcsSUFBS0EsT0FBTyxDQUFDQyxLQUFLLEdBQ2pELFlBQVk7SUFBRUQsT0FBTyxDQUFDQyxLQUFLLENBQUNDLEtBQUssQ0FBQ0YsT0FBTyxFQUFFRyxTQUFTLENBQUM7RUFBRSxDQUFDLEdBQ3hELFlBQVksQ0FBQyxDQUFFO0FBQzFCO0FBRUEsU0FBU0Msc0JBQXNCLENBQUNDLGNBQWMs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eUYsbUJBQW1CO0lBQ2hENUYsT0FBTyxDQUFDRSxNQUFNLEdBQUcsQ0FBQyxDQUFDMEYsbUJBQW1CO0VBQ3hDO0FBQ0YsQ0FBQzs7QUFFRDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E1RixPQUFPLENBQUM4RCxZQUFZLEdBQUcsVUFBVWpDLENBQUMsRUFBRTtFQUNsQyxJQUFJLENBQUU3QixPQUFPLENBQUNFLE1BQU0sRUFDbEIsTUFBTSxJQUFJOEMsS0FBSyxDQUFDLG9EQUFvRCxDQUFDO0VBRXZFaEQsT0FBTyxDQUFDRyxrQkFBa0IsQ0FBQzJELFlBQVksQ0FBQ2pDLENBQUMsQ0FBQztBQUM1QyxDQUFDOztBQUVEOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTdCLE9BQU8sQ0FBQzZGLFVBQVUsR0FBRyxVQUFVaEUsQ0FBQyxFQUFFO0VBQ2hDUyxtQkFBbUIsQ0FBQ1osSUFBSSxDQUFDRyxDQUFDLENBQUM7RUFDM0JVLFlBQVksRUFBRTtBQUNoQixDQUFDLEMiLCJmaWxlIjoiL3BhY2thZ2VzL3RyYWNrZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gUGFja2FnZSBkb2NzIGF0IGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXIgLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbi8qKlxuICogQG5hbWVzcGFjZSBUcmFja2VyXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBUcmFja2VyLXJlbGF0ZWQgbWV0aG9kcy5cbiAqL1xuVHJhY2tlciA9IHt9O1xuXG4vKipcbiAqIEBuYW1lc3BhY2UgRGVwc1xuICogQGRlcHJlY2F0ZWRcbiAqL1xuRGVwcyA9IFRyYWNrZXI7XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWN0aXZlXG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGVyZSBpcyBhIGN1cnJlbnQgY29tcHV0YXRpb24sIG1lYW5pbmcgdGhhdCBkZXBlbmRlbmNpZXMgb24gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIHdpbGwgYmUgdHJhY2tlZCBhbmQgcG90ZW50aWFsbHkgY2F1c2UgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gdG8gYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAdHlwZSB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tlci5hY3RpdmUgPSBmYWxzZTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9jdXJyZW50Y29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBUaGUgY3VycmVudCBjb21wdXRhdGlvbiwgb3IgYG51bGxgIGlmIHRoZXJlIGlzbid0IG9uZS4gIFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIGlzIHRoZSBbYFRyYWNrZXIuQ29tcHV0YXRpb25gXSgjdHJhY2tlcl9jb21wdXRhdGlvbikgb2JqZWN0IGNyZWF0ZWQgYnkgdGhlIGlubmVybW9zdCBhY3RpdmUgY2FsbCB0byBgVHJhY2tlci5hdXRvcnVuYCwgYW5kIGl0J3MgdGhlIGNvbXB1dGF0aW9uIHRoYXQgZ2FpbnMgZGVwZW5kZW5jaWVzIHdoZW4gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFyZSBhY2Nlc3NlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtUcmFja2VyLkNvbXB1dGF0aW9ufVxuICovXG5UcmFja2VyLmN1cnJlbnRDb21wdXRhdGlvbiA9IG51bGw7XG5cbmZ1bmN0aW9uIF9kZWJ1Z0Z1bmMoKSB7XG4gIC8vIFdlIHdhbnQgdGhpcyBjb2RlIHRvIHdvcmsgd2l0aG91dCBNZXRlb3IsIGFuZCBhbHNvIHdpdGhvdXRcbiAgLy8gXCJjb25zb2xlXCIgKHdoaWNoIGlzIHRlY2huaWNhbGx5IG5vbi1zdGFuZGFyZCBhbmQgbWF5IGJlIG1pc3NpbmdcbiAgLy8gb24gc29tZSBicm93c2VyIHdlIGNvbWUgYWNyb3NzLCBsaWtlIGl0IHdhcyBvbiBJRSA3KS5cbiAgLy9cbiAgLy8gTGF6eSBldmFsdWF0aW9uIGJlY2F1c2UgYE1ldGVvcmAgZG9lcyBub3QgZXhpc3QgcmlnaHQgYXdheS4oPz8pXG4gIHJldHVybiAodHlwZW9mIE1ldGVvciAhPT0gXCJ1bmRlZmluZWRcIiA/IE1ldGVvci5fZGVidWcgOlxuICAgICAgICAgICgodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUuZXJyb3IgP1xuICAgICAgICAgICBmdW5jdGlvbiAoKSB7IGNvbnNvbGUuZXJyb3IuYXBwbHkoY29uc29sZSwgYXJndW1lbnRzKTsgfSA6XG4gICAgICAgICAgIGZ1bmN0aW9uICgpIHt9KSk7XG59XG5cbmZ1bmN0aW9uIF9tYXliZVN1cHByZXNzTW9yZUxvZ3MobWVzc2FnZXNMZW5ndGgpIHtcbiAgLy8gU29tZXRpbWVzIHdoZW4gcnVubmluZyB0ZXN0cywgd2UgaW50ZW50aW9uYWxseSBzdXBwcmVzcyBsb2dzIG9uIGV4cGVjdGVkXG4gIC8vIHByaW50ZWQgZXJyb3JzLiBTaW5jZSB0aGUgY3VycmVudCBpbXBsZW1lbnRhdGlvbiBvZiBfdGhyb3dPckxvZyBjYW4gbG9nXG4gIC8vIG11bHRpcGxlIHNlcGFyYXRlIGxvZyBtZXNzYWdlcywgc3VwcHJlc3MgYWxsIG9mIHRoZW0gaWYgYXQgbGVhc3Qgb25lIHN1cHByZXNzXG4gIC8vIGlzIGV4cGVjdGVkIGFzIHdlIHN0aWxsIHdhbnQgdGhlbSB0byBjb3VudCBhcyBvbmUuXG4gIGlmICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgaWYgKE1ldGVvci5fc3VwcHJlc3NlZF9sb2dfZXhwZWN0ZWQoKSkge1xuICAgICAgTWV0ZW9yLl9zdXBwcmVzc19sb2cobWVzc2FnZXNMZW5ndGggLSAxKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gX3Rocm93T3JMb2coZnJvbSwgZSkge1xuICBpZiAodGhyb3dGaXJzdEVycm9yKSB7XG4gICAgdGhyb3cgZTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgcHJpbnRBcmdzID0gW1wiRXhjZXB0aW9uIGZyb20gVHJhY2tlciBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIl07XG4gICAgaWYgKGUuc3RhY2sgJiYgZS5tZXNzYWdlICYmIGUubmFtZSkge1xuICAgICAgdmFyIGlkeCA9IGUuc3RhY2suaW5kZXhPZihlLm1lc3NhZ2UpO1xuICAgICAgaWYgKGlkeCA8IDAgfHwgaWR4ID4gZS5uYW1lLmxlbmd0aCArIDIpIHsgLy8gY2hlY2sgZm9yIFwiRXJyb3I6IFwiXG4gICAgICAgIC8vIG1lc3NhZ2UgaXMgbm90IHBhcnQgb2YgdGhlIHN0YWNrXG4gICAgICAgIHZhciBtZXNzYWdlID0gZS5uYW1lICsgXCI6IFwiICsgZS5tZXNzYWdlO1xuICAgICAgICBwcmludEFyZ3MucHVzaChtZXNzYWdlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcHJpbnRBcmdzLnB1c2goZS5zdGFjayk7XG4gICAgX21heWJlU3VwcHJlc3NNb3JlTG9ncyhwcmludEFyZ3MubGVuZ3RoKTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJpbnRBcmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBfZGVidWdGdW5jKCkocHJpbnRBcmdzW2ldKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gVGFrZXMgYSBmdW5jdGlvbiBgZmAsIGFuZCB3cmFwcyBpdCBpbiBhIGBNZXRlb3IuX25vWWllbGRzQWxsb3dlZGBcbi8vIGJsb2NrIGlmIHdlIGFyZSBydW5uaW5nIG9uIHRoZSBzZXJ2ZXIuIE9uIHRoZSBjbGllbnQsIHJldHVybnMgdGhlXG4vLyBvcmlnaW5hbCBmdW5jdGlvbiAoc2luY2UgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYCBpcyBhXG4vLyBuby1vcCkuIFRoaXMgaGFzIHRoZSBiZW5lZml0IG9mIG5vdCBhZGRpbmcgYW4gdW5uZWNlc3Nhcnkgc3RhY2tcbi8vIGZyYW1lIG9uIHRoZSBjbGllbnQuXG5mdW5jdGlvbiB3aXRoTm9ZaWVsZHNBbGxvd2VkKGYpIHtcbiAgaWYgKCh0eXBlb2YgTWV0ZW9yID09PSAndW5kZWZpbmVkJykgfHwgTWV0ZW9yLmlzQ2xpZW50KSB7XG4gICAgcmV0dXJuIGY7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgICBmLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfVxufVxuXG52YXIgbmV4dElkID0gMTtcbi8vIGNvbXB1dGF0aW9ucyB3aG9zZSBjYWxsYmFja3Mgd2Ugc2hvdWxkIGNhbGwgYXQgZmx1c2ggdGltZVxudmFyIHBlbmRpbmdDb21wdXRhdGlvbnMgPSBbXTtcbi8vIGB0cnVlYCBpZiBhIFRyYWNrZXIuZmx1c2ggaXMgc2NoZWR1bGVkLCBvciBpZiB3ZSBhcmUgaW4gVHJhY2tlci5mbHVzaCBub3dcbnZhciB3aWxsRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgaW4gVHJhY2tlci5mbHVzaCBub3dcbnZhciBpbkZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGNvbXB1dGluZyBhIGNvbXB1dGF0aW9uIG5vdywgZWl0aGVyIGZpcnN0IHRpbWVcbi8vIG9yIHJlY29tcHV0ZS4gIFRoaXMgbWF0Y2hlcyBUcmFja2VyLmFjdGl2ZSB1bmxlc3Mgd2UgYXJlIGluc2lkZVxuLy8gVHJhY2tlci5ub25yZWFjdGl2ZSwgd2hpY2ggbnVsbGZpZXMgY3VycmVudENvbXB1dGF0aW9uIGV2ZW4gdGhvdWdoXG4vLyBhbiBlbmNsb3NpbmcgY29tcHV0YXRpb24gbWF5IHN0aWxsIGJlIHJ1bm5pbmcuXG52YXIgaW5Db21wdXRlID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgdGhlIGBfdGhyb3dGaXJzdEVycm9yYCBvcHRpb24gd2FzIHBhc3NlZCBpbiB0byB0aGUgY2FsbFxuLy8gdG8gVHJhY2tlci5mbHVzaCB0aGF0IHdlIGFyZSBpbi4gV2hlbiBzZXQsIHRocm93IHJhdGhlciB0aGFuIGxvZyB0aGVcbi8vIGZpcnN0IGVycm9yIGVuY291bnRlcmVkIHdoaWxlIGZsdXNoaW5nLiBCZWZvcmUgdGhyb3dpbmcgdGhlIGVycm9yLFxuLy8gZmluaXNoIGZsdXNoaW5nIChmcm9tIGEgZmluYWxseSBibG9jayksIGxvZ2dpbmcgYW55IHN1YnNlcXVlbnRcbi8vIGVycm9ycy5cbnZhciB0aHJvd0ZpcnN0RXJyb3IgPSBmYWxzZTtcblxudmFyIGFmdGVyRmx1c2hDYWxsYmFja3MgPSBbXTtcblxuZnVuY3Rpb24gcmVxdWlyZUZsdXNoKCkge1xuICBpZiAoISB3aWxsRmx1c2gpIHtcbiAgICAvLyBXZSB3YW50IHRoaXMgY29kZSB0byB3b3JrIHdpdGhvdXQgTWV0ZW9yLCBzZWUgZGVidWdGdW5jIGFib3ZlXG4gICAgaWYgKHR5cGVvZiBNZXRlb3IgIT09IFwidW5kZWZpbmVkXCIpXG4gICAgICBNZXRlb3IuX3NldEltbWVkaWF0ZShUcmFja2VyLl9ydW5GbHVzaCk7XG4gICAgZWxzZVxuICAgICAgc2V0VGltZW91dChUcmFja2VyLl9ydW5GbHVzaCwgMCk7XG4gICAgd2lsbEZsdXNoID0gdHJ1ZTtcbiAgfVxufVxuXG4vLyBUcmFja2VyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHZpc2libGUgYnV0IHByaXZhdGVcbi8vICh0aHJvd3MgYW4gZXJyb3IgaWYgeW91IHRyeSB0byBjYWxsIGl0KVxudmFyIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2NvbXB1dGF0aW9uXG5cbi8qKlxuICogQHN1bW1hcnkgQSBDb21wdXRhdGlvbiBvYmplY3QgcmVwcmVzZW50cyBjb2RlIHRoYXQgaXMgcmVwZWF0ZWRseSByZXJ1blxuICogaW4gcmVzcG9uc2UgdG9cbiAqIHJlYWN0aXZlIGRhdGEgY2hhbmdlcy4gQ29tcHV0YXRpb25zIGRvbid0IGhhdmUgcmV0dXJuIHZhbHVlczsgdGhleSBqdXN0XG4gKiBwZXJmb3JtIGFjdGlvbnMsIHN1Y2ggYXMgcmVyZW5kZXJpbmcgYSB0ZW1wbGF0ZSBvbiB0aGUgc2NyZWVuLiBDb21wdXRhdGlvbnNcbiAqIGFyZSBjcmVhdGVkIHVzaW5nIFRyYWNrZXIuYXV0b3J1bi4gVXNlIHN0b3AgdG8gcHJldmVudCBmdXJ0aGVyIHJlcnVubmluZyBvZiBhXG4gKiBjb21wdXRhdGlvbi5cbiAqIEBpbnN0YW5jZW5hbWUgY29tcHV0YXRpb25cbiAqL1xuVHJhY2tlci5Db21wdXRhdGlvbiA9IGNsYXNzIENvbXB1dGF0aW9uIHtcbiAgY29uc3RydWN0b3IoZiwgcGFyZW50LCBvbkVycm9yKSB7XG4gICAgaWYgKCEgY29uc3RydWN0aW5nQ29tcHV0YXRpb24pXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiVHJhY2tlci5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyBwcml2YXRlOyB1c2UgVHJhY2tlci5hdXRvcnVuXCIpO1xuICAgIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cbiAgICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wcGVkXG5cbiAgICAvKipcbiAgICAgKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgY29tcHV0YXRpb24gaGFzIGJlZW4gc3RvcHBlZC5cbiAgICAgKiBAbG9jdXMgQ2xpZW50XG4gICAgICogQG1lbWJlck9mIFRyYWNrZXIuQ29tcHV0YXRpb25cbiAgICAgKiBAaW5zdGFuY2VcbiAgICAgKiBAbmFtZSAgc3RvcHBlZFxuICAgICAqL1xuICAgIHRoaXMuc3RvcHBlZCA9IGZhbHNlO1xuXG4gICAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcblxuICAgIC8qKlxuICAgICAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBjb21wdXRhdGlvbiBoYXMgYmVlbiBpbnZhbGlkYXRlZCAoYW5kIG5vdCB5ZXQgcmVydW4pLCBvciBpZiBpdCBoYXMgYmVlbiBzdG9wcGVkLlxuICAgICAqIEBsb2N1cyBDbGllbnRcbiAgICAgKiBAbWVtYmVyT2YgVHJhY2tlci5Db21wdXRhdGlvblxuICAgICAqIEBpbnN0YW5jZVxuICAgICAqIEBuYW1lICBpbnZhbGlkYXRlZFxuICAgICAqIEB0eXBlIHtCb29sZWFufVxuICAgICAqL1xuICAgIHRoaXMuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuICAgIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG5cbiAgICAvKipcbiAgICAgKiBAc3VtbWFyeSBUcnVlIGR1cmluZyB0aGUgaW5pdGlhbCBydW4gb2YgdGhlIGNvbXB1dGF0aW9uIGF0IHRoZSB0aW1lIGBUcmFja2VyLmF1dG9ydW5gIGlzIGNhbGxlZCwgYW5kIGZhbHNlIG9uIHN1YnNlcXVlbnQgcmVydW5zIGFuZCBhdCBvdGhlciB0aW1lcy5cbiAgICAgKiBAbG9jdXMgQ2xpZW50XG4gICAgICogQG1lbWJlck9mIFRyYWNrZXIuQ29tcHV0YXRpb25cbiAgICAgKiBAaW5zdGFuY2VcbiAgICAgKiBAbmFtZSAgZmlyc3RSdW5cbiAgICAgKiBAdHlwZSB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICB0aGlzLmZpcnN0UnVuID0gdHJ1ZTtcblxuICAgIHRoaXMuX2lkID0gbmV4dElkKys7XG4gICAgdGhpcy5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG4gICAgdGhpcy5fb25TdG9wQ2FsbGJhY2tzID0gW107XG4gICAgLy8gdGhlIHBsYW4gaXMgYXQgc29tZSBwb2ludCB0byB1c2UgdGhlIHBhcmVudCByZWxhdGlvblxuICAgIC8vIHRvIGNvbnN0cmFpbiB0aGUgb3JkZXIgdGhhdCBjb21wdXRhdGlvbnMgYXJlIHByb2Nlc3NlZFxuICAgIHRoaXMuX3BhcmVudCA9IHBhcmVudDtcbiAgICB0aGlzLl9mdW5jID0gZjtcbiAgICB0aGlzLl9vbkVycm9yID0gb25FcnJvcjtcbiAgICB0aGlzLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXG4gICAgdmFyIGVycm9yZWQgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLl9jb21wdXRlKCk7XG4gICAgICBlcnJvcmVkID0gZmFsc2U7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuZmlyc3RSdW4gPSBmYWxzZTtcbiAgICAgIGlmIChlcnJvcmVkKVxuICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICB9XG4gIH1cblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9vbmludmFsaWRhdGVcblxuICAvKipcbiAgICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLiAgVGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIGludmFsaWRhdGlvbi4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgaW52YWxpZGF0ZWQuXG4gICAqL1xuICBvbkludmFsaWRhdGUoZikge1xuICAgIGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGZ1bmN0aW9uXCIpO1xuXG4gICAgaWYgKHRoaXMuaW52YWxpZGF0ZWQpIHtcbiAgICAgIFRyYWNrZXIubm9ucmVhY3RpdmUoKCkgPT4ge1xuICAgICAgICB3aXRoTm9ZaWVsZHNBbGxvd2VkKGYpKHRoaXMpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX29uSW52YWxpZGF0ZUNhbGxiYWNrcy5wdXNoKGYpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBSZWdpc3RlcnMgYGNhbGxiYWNrYCB0byBydW4gd2hlbiB0aGlzIGNvbXB1dGF0aW9uIGlzIHN0b3BwZWQsIG9yIHJ1bnMgaXQgaW1tZWRpYXRlbHkgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGFscmVhZHkgc3RvcHBlZC4gIFRoZSBjYWxsYmFjayBpcyBydW4gYWZ0ZXIgYW55IGBvbkludmFsaWRhdGVgIGNhbGxiYWNrcy5cbiAgICogQGxvY3VzIENsaWVudFxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gc3RvcC4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgc3RvcHBlZC5cbiAgICovXG4gIG9uU3RvcChmKSB7XG4gICAgaWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwib25TdG9wIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cbiAgICBpZiAodGhpcy5zdG9wcGVkKSB7XG4gICAgICBUcmFja2VyLm5vbnJlYWN0aXZlKCgpID0+IHtcbiAgICAgICAgd2l0aE5vWWllbGRzQWxsb3dlZChmKSh0aGlzKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9vblN0b3BDYWxsYmFja3MucHVzaChmKTtcbiAgICB9XG4gIH1cblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEludmFsaWRhdGVzIHRoaXMgY29tcHV0YXRpb24gc28gdGhhdCBpdCB3aWxsIGJlIHJlcnVuLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqL1xuICBpbnZhbGlkYXRlKCkge1xuICAgIGlmICghIHRoaXMuaW52YWxpZGF0ZWQpIHtcbiAgICAgIC8vIGlmIHdlJ3JlIGN1cnJlbnRseSBpbiBfcmVjb21wdXRlKCksIGRvbid0IGVucXVldWVcbiAgICAgIC8vIG91cnNlbHZlcywgc2luY2Ugd2UnbGwgcmVydW4gaW1tZWRpYXRlbHkgYW55d2F5LlxuICAgICAgaWYgKCEgdGhpcy5fcmVjb21wdXRpbmcgJiYgISB0aGlzLnN0b3BwZWQpIHtcbiAgICAgICAgcmVxdWlyZUZsdXNoKCk7XG4gICAgICAgIHBlbmRpbmdDb21wdXRhdGlvbnMucHVzaCh0aGlzKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pbnZhbGlkYXRlZCA9IHRydWU7XG5cbiAgICAgIC8vIGNhbGxiYWNrcyBjYW4ndCBhZGQgY2FsbGJhY2tzLCBiZWNhdXNlXG4gICAgICAvLyB0aGlzLmludmFsaWRhdGVkID09PSB0cnVlLlxuICAgICAgZm9yKHZhciBpID0gMCwgZjsgZiA9IHRoaXMuX29uSW52YWxpZGF0ZUNhbGxiYWNrc1tpXTsgaSsrKSB7XG4gICAgICAgIFRyYWNrZXIubm9ucmVhY3RpdmUoKCkgPT4ge1xuICAgICAgICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoZikodGhpcyk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdGhpcy5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG4gICAgfVxuICB9XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcFxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBQcmV2ZW50cyB0aGlzIGNvbXB1dGF0aW9uIGZyb20gcmVydW5uaW5nLlxuICAgKiBAbG9jdXMgQ2xpZW50XG4gICAqL1xuICBzdG9wKCkge1xuICAgIGlmICghIHRoaXMuc3RvcHBlZCkge1xuICAgICAgdGhpcy5zdG9wcGVkID0gdHJ1ZTtcbiAgICAgIHRoaXMuaW52YWxpZGF0ZSgpO1xuICAgICAgZm9yKHZhciBpID0gMCwgZjsgZiA9IHRoaXMuX29uU3RvcENhbGxiYWNrc1tpXTsgaSsrKSB7XG4gICAgICAgIFRyYWNrZXIubm9ucmVhY3RpdmUoKCkgPT4ge1xuICAgICAgICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoZikodGhpcyk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdGhpcy5fb25TdG9wQ2FsbGJhY2tzID0gW107XG4gICAgfVxuICB9XG5cbiAgX2NvbXB1dGUoKSB7XG4gICAgdGhpcy5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG4gICAgdmFyIHByZXZpb3VzSW5Db21wdXRlID0gaW5Db21wdXRlO1xuICAgIGluQ29tcHV0ZSA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIFRyYWNrZXIud2l0aENvbXB1dGF0aW9uKHRoaXMsICgpID0+IHtcbiAgICAgICAgd2l0aE5vWWllbGRzQWxsb3dlZCh0aGlzLl9mdW5jKSh0aGlzKTtcbiAgICAgIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBpbkNvbXB1dGUgPSBwcmV2aW91c0luQ29tcHV0ZTtcbiAgICB9XG4gIH1cblxuICBfbmVlZHNSZWNvbXB1dGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuaW52YWxpZGF0ZWQgJiYgISB0aGlzLnN0b3BwZWQ7XG4gIH1cblxuICBfcmVjb21wdXRlKCkge1xuICAgIHRoaXMuX3JlY29tcHV0aW5nID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuX25lZWRzUmVjb21wdXRlKCkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICB0aGlzLl9jb21wdXRlKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBpZiAodGhpcy5fb25FcnJvcikge1xuICAgICAgICAgICAgdGhpcy5fb25FcnJvcihlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgX3Rocm93T3JMb2coXCJyZWNvbXB1dGVcIiwgZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuX3JlY29tcHV0aW5nID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFByb2Nlc3MgdGhlIHJlYWN0aXZlIHVwZGF0ZXMgZm9yIHRoaXMgY29tcHV0YXRpb24gaW1tZWRpYXRlbHlcbiAgICogYW5kIGVuc3VyZSB0aGF0IHRoZSBjb21wdXRhdGlvbiBpcyByZXJ1bi4gVGhlIGNvbXB1dGF0aW9uIGlzIHJlcnVuIG9ubHlcbiAgICogaWYgaXQgaXMgaW52YWxpZGF0ZWQuXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICovXG4gIGZsdXNoKCkge1xuICAgIGlmICh0aGlzLl9yZWNvbXB1dGluZylcbiAgICAgIHJldHVybjtcblxuICAgIHRoaXMuX3JlY29tcHV0ZSgpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IENhdXNlcyB0aGUgZnVuY3Rpb24gaW5zaWRlIHRoaXMgY29tcHV0YXRpb24gdG8gcnVuIGFuZFxuICAgKiBzeW5jaHJvbm91c2x5IHByb2Nlc3MgYWxsIHJlYWN0aXZlIHVwZHRlcy5cbiAgICogQGxvY3VzIENsaWVudFxuICAgKi9cbiAgcnVuKCkge1xuICAgIHRoaXMuaW52YWxpZGF0ZSgpO1xuICAgIHRoaXMuZmx1c2goKTtcbiAgfVxufTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZGVwZW5kZW5jeVxuXG4vKipcbiAqIEBzdW1tYXJ5IEEgRGVwZW5kZW5jeSByZXByZXNlbnRzIGFuIGF0b21pYyB1bml0IG9mIHJlYWN0aXZlIGRhdGEgdGhhdCBhXG4gKiBjb21wdXRhdGlvbiBtaWdodCBkZXBlbmQgb24uIFJlYWN0aXZlIGRhdGEgc291cmNlcyBzdWNoIGFzIFNlc3Npb24gb3JcbiAqIE1pbmltb25nbyBpbnRlcm5hbGx5IGNyZWF0ZSBkaWZmZXJlbnQgRGVwZW5kZW5jeSBvYmplY3RzIGZvciBkaWZmZXJlbnRcbiAqIHBpZWNlcyBvZiBkYXRhLCBlYWNoIG9mIHdoaWNoIG1heSBiZSBkZXBlbmRlZCBvbiBieSBtdWx0aXBsZSBjb21wdXRhdGlvbnMuXG4gKiBXaGVuIHRoZSBkYXRhIGNoYW5nZXMsIHRoZSBjb21wdXRhdGlvbnMgYXJlIGludmFsaWRhdGVkLlxuICogQGNsYXNzXG4gKiBAaW5zdGFuY2VOYW1lIGRlcGVuZGVuY3lcbiAqL1xuVHJhY2tlci5EZXBlbmRlbmN5ID0gY2xhc3MgRGVwZW5kZW5jeSB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuX2RlcGVuZGVudHNCeUlkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgfVxuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfZGVwZW5kXG4gIC8vXG4gIC8vIEFkZHMgYGNvbXB1dGF0aW9uYCB0byB0aGlzIHNldCBpZiBpdCBpcyBub3QgYWxyZWFkeVxuICAvLyBwcmVzZW50LiAgUmV0dXJucyB0cnVlIGlmIGBjb21wdXRhdGlvbmAgaXMgYSBuZXcgbWVtYmVyIG9mIHRoZSBzZXQuXG4gIC8vIElmIG5vIGFyZ3VtZW50LCBkZWZhdWx0cyB0byBjdXJyZW50Q29tcHV0YXRpb24sIG9yIGRvZXMgbm90aGluZ1xuICAvLyBpZiB0aGVyZSBpcyBubyBjdXJyZW50Q29tcHV0YXRpb24uXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IERlY2xhcmVzIHRoYXQgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKG9yIGBmcm9tQ29tcHV0YXRpb25gIGlmIGdpdmVuKSBkZXBlbmRzIG9uIGBkZXBlbmRlbmN5YC4gIFRoZSBjb21wdXRhdGlvbiB3aWxsIGJlIGludmFsaWRhdGVkIHRoZSBuZXh0IHRpbWUgYGRlcGVuZGVuY3lgIGNoYW5nZXMuXG5cbiAgIElmIHRoZXJlIGlzIG5vIGN1cnJlbnQgY29tcHV0YXRpb24gYW5kIGBkZXBlbmQoKWAgaXMgY2FsbGVkIHdpdGggbm8gYXJndW1lbnRzLCBpdCBkb2VzIG5vdGhpbmcgYW5kIHJldHVybnMgZmFsc2UuXG5cbiAgIFJldHVybnMgdHJ1ZSBpZiB0aGUgY29tcHV0YXRpb24gaXMgYSBuZXcgZGVwZW5kZW50IG9mIGBkZXBlbmRlbmN5YCByYXRoZXIgdGhhbiBhbiBleGlzdGluZyBvbmUuXG4gICAqIEBsb2N1cyBDbGllbnRcbiAgICogQHBhcmFtIHtUcmFja2VyLkNvbXB1dGF0aW9ufSBbZnJvbUNvbXB1dGF0aW9uXSBBbiBvcHRpb25hbCBjb21wdXRhdGlvbiBkZWNsYXJlZCB0byBkZXBlbmQgb24gYGRlcGVuZGVuY3lgIGluc3RlYWQgb2YgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24uXG4gICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgKi9cbiAgZGVwZW5kKGNvbXB1dGF0aW9uKSB7XG4gICAgaWYgKCEgY29tcHV0YXRpb24pIHtcbiAgICAgIGlmICghIFRyYWNrZXIuYWN0aXZlKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgIGNvbXB1dGF0aW9uID0gVHJhY2tlci5jdXJyZW50Q29tcHV0YXRpb247XG4gICAgfVxuICAgIHZhciBpZCA9IGNvbXB1dGF0aW9uLl9pZDtcbiAgICBpZiAoISAoaWQgaW4gdGhpcy5fZGVwZW5kZW50c0J5SWQpKSB7XG4gICAgICB0aGlzLl9kZXBlbmRlbnRzQnlJZFtpZF0gPSBjb21wdXRhdGlvbjtcbiAgICAgIGNvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZSgoKSA9PiB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLl9kZXBlbmRlbnRzQnlJZFtpZF07XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2NoYW5nZWRcblxuICAvKipcbiAgICogQHN1bW1hcnkgSW52YWxpZGF0ZSBhbGwgZGVwZW5kZW50IGNvbXB1dGF0aW9ucyBpbW1lZGlhdGVseSBhbmQgcmVtb3ZlIHRoZW0gYXMgZGVwZW5kZW50cy5cbiAgICogQGxvY3VzIENsaWVudFxuICAgKi9cbiAgY2hhbmdlZCgpIHtcbiAgICBmb3IgKHZhciBpZCBpbiB0aGlzLl9kZXBlbmRlbnRzQnlJZClcbiAgICAgIHRoaXMuX2RlcGVuZGVudHNCeUlkW2lkXS5pbnZhbGlkYXRlKCk7XG4gIH1cblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2hhc2RlcGVuZGVudHNcblxuICAvKipcbiAgICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIERlcGVuZGVuY3kgaGFzIG9uZSBvciBtb3JlIGRlcGVuZGVudCBDb21wdXRhdGlvbnMsIHdoaWNoIHdvdWxkIGJlIGludmFsaWRhdGVkIGlmIHRoaXMgRGVwZW5kZW5jeSB3ZXJlIHRvIGNoYW5nZS5cbiAgICogQGxvY3VzIENsaWVudFxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICovXG4gIGhhc0RlcGVuZGVudHMoKSB7XG4gICAgZm9yICh2YXIgaWQgaW4gdGhpcy5fZGVwZW5kZW50c0J5SWQpXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZmx1c2hcblxuLyoqXG4gKiBAc3VtbWFyeSBQcm9jZXNzIGFsbCByZWFjdGl2ZSB1cGRhdGVzIGltbWVkaWF0ZWx5IGFuZCBlbnN1cmUgdGhhdCBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGFyZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tlci5mbHVzaCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gIFRyYWNrZXIuX3J1bkZsdXNoKHsgZmluaXNoU3luY2hyb25vdXNseTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICB0aHJvd0ZpcnN0RXJyb3I6IG9wdGlvbnMgJiYgb3B0aW9ucy5fdGhyb3dGaXJzdEVycm9yIH0pO1xufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHdlIGFyZSBjb21wdXRpbmcgYSBjb21wdXRhdGlvbiBub3csIGVpdGhlciBmaXJzdCB0aW1lIG9yIHJlY29tcHV0ZS4gIFRoaXMgbWF0Y2hlcyBUcmFja2VyLmFjdGl2ZSB1bmxlc3Mgd2UgYXJlIGluc2lkZSBUcmFja2VyLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2ggYW4gZW5jbG9zaW5nIGNvbXB1dGF0aW9uIG1heSBzdGlsbCBiZSBydW5uaW5nLlxuICogQGxvY3VzIENsaWVudFxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrZXIuaW5GbHVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIGluRmx1c2g7XG59XG5cbi8vIFJ1biBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnMgYW5kIGFmdGVyRmx1c2ggY2FsbGJhY2tzLiAgSWYgd2Ugd2VyZSBub3QgY2FsbGVkXG4vLyBkaXJlY3RseSB2aWEgVHJhY2tlci5mbHVzaCwgdGhpcyBtYXkgcmV0dXJuIGJlZm9yZSB0aGV5J3JlIGFsbCBkb25lIHRvIGFsbG93XG4vLyB0aGUgZXZlbnQgbG9vcCB0byBydW4gYSBsaXR0bGUgYmVmb3JlIGNvbnRpbnVpbmcuXG5UcmFja2VyLl9ydW5GbHVzaCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gIC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuICAvLyBoYXZlIFNwYXJrKVxuICAvL1xuICAvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuICAvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG4gIC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgVHJhY2tlci5mbHVzaC4gIEF0IHRoZSBtb21lbnRcbiAgLy8gU3BhcmsgYmxvY2tzIGV2ZW50IGhhbmRsZXJzIGR1cmluZyBET00gbXV0YXRpb24gYW55d2F5LFxuICAvLyBiZWNhdXNlIHRoZSBMaXZlUmFuZ2UgdHJlZSBpc24ndCB2YWxpZC4gIEFuZCB3ZSBkb24ndCBoYXZlXG4gIC8vIGFueSB1c2VmdWwgbm90aW9uIG9mIGEgbmVzdGVkIGZsdXNoLlxuICAvL1xuICAvLyBodHRwczovL2FwcC5hc2FuYS5jb20vMC8xNTk5MDgzMzAyNDQvMzg1MTM4MjMzODU2XG4gIGlmIChUcmFja2VyLmluRmx1c2goKSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBjYWxsIFRyYWNrZXIuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cbiAgaWYgKGluQ29tcHV0ZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgVHJhY2tlci5hdXRvcnVuXCIpO1xuXG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIGluRmx1c2ggPSB0cnVlO1xuICB3aWxsRmx1c2ggPSB0cnVlO1xuICB0aHJvd0ZpcnN0RXJyb3IgPSAhISBvcHRpb25zLnRocm93Rmlyc3RFcnJvcjtcblxuICB2YXIgcmVjb21wdXRlZENvdW50ID0gMDtcbiAgdmFyIGZpbmlzaGVkVHJ5ID0gZmFsc2U7XG4gIHRyeSB7XG4gICAgd2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoIHx8XG4gICAgICAgICAgIGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cbiAgICAgIC8vIHJlY29tcHV0ZSBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnNcbiAgICAgIHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCkge1xuICAgICAgICB2YXIgY29tcCA9IHBlbmRpbmdDb21wdXRhdGlvbnMuc2hpZnQoKTtcbiAgICAgICAgY29tcC5fcmVjb21wdXRlKCk7XG4gICAgICAgIGlmIChjb21wLl9uZWVkc1JlY29tcHV0ZSgpKSB7XG4gICAgICAgICAgcGVuZGluZ0NvbXB1dGF0aW9ucy51bnNoaWZ0KGNvbXApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCEgb3B0aW9ucy5maW5pc2hTeW5jaHJvbm91c2x5ICYmICsrcmVjb21wdXRlZENvdW50ID4gMTAwMCkge1xuICAgICAgICAgIGZpbmlzaGVkVHJ5ID0gdHJ1ZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG4gICAgICAgIC8vIGNhbGwgb25lIGFmdGVyRmx1c2ggY2FsbGJhY2ssIHdoaWNoIG1heVxuICAgICAgICAvLyBpbnZhbGlkYXRlIG1vcmUgY29tcHV0YXRpb25zXG4gICAgICAgIHZhciBmdW5jID0gYWZ0ZXJGbHVzaENhbGxiYWNrcy5zaGlmdCgpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGZ1bmMoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIF90aHJvd09yTG9nKFwiYWZ0ZXJGbHVzaFwiLCBlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBmaW5pc2hlZFRyeSA9IHRydWU7XG4gIH0gZmluYWxseSB7XG4gICAgaWYgKCEgZmluaXNoZWRUcnkpIHtcbiAgICAgIC8vIHdlJ3JlIGVycm9yaW5nIGR1ZSB0byB0aHJvd0ZpcnN0RXJyb3IgYmVpbmcgdHJ1ZS5cbiAgICAgIGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBUcmFja2VyLmZsdXNoKClgIGFnYWluXG4gICAgICAvLyBmaW5pc2ggZmx1c2hpbmdcbiAgICAgIFRyYWNrZXIuX3J1bkZsdXNoKHtcbiAgICAgICAgZmluaXNoU3luY2hyb25vdXNseTogb3B0aW9ucy5maW5pc2hTeW5jaHJvbm91c2x5LFxuICAgICAgICB0aHJvd0ZpcnN0RXJyb3I6IGZhbHNlXG4gICAgICB9KTtcbiAgICB9XG4gICAgd2lsbEZsdXNoID0gZmFsc2U7XG4gICAgaW5GbHVzaCA9IGZhbHNlO1xuICAgIGlmIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCB8fCBhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuICAgICAgLy8gV2UncmUgeWllbGRpbmcgYmVjYXVzZSB3ZSByYW4gYSBidW5jaCBvZiBjb21wdXRhdGlvbnMgYW5kIHdlIGFyZW4ndFxuICAgICAgLy8gcmVxdWlyZWQgdG8gZmluaXNoIHN5bmNocm9ub3VzbHksIHNvIHdlJ2QgbGlrZSB0byBnaXZlIHRoZSBldmVudCBsb29wIGFcbiAgICAgIC8vIGNoYW5jZS4gV2Ugc2hvdWxkIGZsdXNoIGFnYWluIHNvb24uXG4gICAgICBpZiAob3B0aW9ucy5maW5pc2hTeW5jaHJvbm91c2x5KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcInN0aWxsIGhhdmUgbW9yZSB0byBkbz9cIik7ICAvLyBzaG91bGRuJ3QgaGFwcGVuXG4gICAgICB9XG4gICAgICBzZXRUaW1lb3V0KHJlcXVpcmVGbHVzaCwgMTApO1xuICAgIH1cbiAgfVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hdXRvcnVuXG4vL1xuLy8gUnVuIGYoKS4gUmVjb3JkIGl0cyBkZXBlbmRlbmNpZXMuIFJlcnVuIGl0IHdoZW5ldmVyIHRoZVxuLy8gZGVwZW5kZW5jaWVzIGNoYW5nZS5cbi8vXG4vLyBSZXR1cm5zIGEgbmV3IENvbXB1dGF0aW9uLCB3aGljaCBpcyBhbHNvIHBhc3NlZCB0byBmLlxuLy9cbi8vIExpbmtzIHRoZSBjb21wdXRhdGlvbiB0byB0aGUgY3VycmVudCBjb21wdXRhdGlvblxuLy8gc28gdGhhdCBpdCBpcyBzdG9wcGVkIGlmIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIGlzIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBjYWxsYmFjayBUcmFja2VyLkNvbXB1dGF0aW9uRnVuY3Rpb25cbiAqIEBwYXJhbSB7VHJhY2tlci5Db21wdXRhdGlvbn1cbiAqL1xuLyoqXG4gKiBAc3VtbWFyeSBSdW4gYSBmdW5jdGlvbiBub3cgYW5kIHJlcnVuIGl0IGxhdGVyIHdoZW5ldmVyIGl0cyBkZXBlbmRlbmNpZXNcbiAqIGNoYW5nZS4gUmV0dXJucyBhIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IGNhbiBiZSB1c2VkIHRvIHN0b3Agb3Igb2JzZXJ2ZSB0aGVcbiAqIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7VHJhY2tlci5Db21wdXRhdGlvbkZ1bmN0aW9ufSBydW5GdW5jIFRoZSBmdW5jdGlvbiB0byBydW4uIEl0IHJlY2VpdmVzXG4gKiBvbmUgYXJndW1lbnQ6IHRoZSBDb21wdXRhdGlvbiBvYmplY3QgdGhhdCB3aWxsIGJlIHJldHVybmVkLlxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9ucy5vbkVycm9yIE9wdGlvbmFsLiBUaGUgZnVuY3Rpb24gdG8gcnVuIHdoZW4gYW4gZXJyb3JcbiAqIGhhcHBlbnMgaW4gdGhlIENvbXB1dGF0aW9uLiBUaGUgb25seSBhcmd1bWVudCBpdCByZWNlaXZlcyBpcyB0aGUgRXJyb3JcbiAqIHRocm93bi4gRGVmYXVsdHMgdG8gdGhlIGVycm9yIGJlaW5nIGxvZ2dlZCB0byB0aGUgY29uc29sZS5cbiAqIEByZXR1cm5zIHtUcmFja2VyLkNvbXB1dGF0aW9ufVxuICovXG5UcmFja2VyLmF1dG9ydW4gPSBmdW5jdGlvbiAoZiwgb3B0aW9ucykge1xuICBpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdUcmFja2VyLmF1dG9ydW4gcmVxdWlyZXMgYSBmdW5jdGlvbiBhcmd1bWVudCcpO1xuXG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gdHJ1ZTtcbiAgdmFyIGMgPSBuZXcgVHJhY2tlci5Db21wdXRhdGlvbihcbiAgICBmLCBUcmFja2VyLmN1cnJlbnRDb21wdXRhdGlvbiwgb3B0aW9ucy5vbkVycm9yKTtcblxuICBpZiAoVHJhY2tlci5hY3RpdmUpXG4gICAgVHJhY2tlci5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgYy5zdG9wKCk7XG4gICAgfSk7XG5cbiAgcmV0dXJuIGM7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX25vbnJlYWN0aXZlXG4vL1xuLy8gUnVuIGBmYCB3aXRoIG5vIGN1cnJlbnQgY29tcHV0YXRpb24sIHJldHVybmluZyB0aGUgcmV0dXJuIHZhbHVlXG4vLyBvZiBgZmAuICBVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4vLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuLy8gY29tcHV0YXRpb25zIGJlaW5nIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIHdpdGhvdXQgdHJhY2tpbmcgZGVwZW5kZW5jaWVzLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBBIGZ1bmN0aW9uIHRvIGNhbGwgaW1tZWRpYXRlbHkuXG4gKi9cblRyYWNrZXIubm9ucmVhY3RpdmUgPSBmdW5jdGlvbiAoZikge1xuICByZXR1cm4gVHJhY2tlci53aXRoQ29tcHV0YXRpb24obnVsbCwgZik7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IEhlbHBlciBmdW5jdGlvbiB0byBtYWtlIHRoZSB0cmFja2VyIHdvcmsgd2l0aCBwcm9taXNlcy5cbiAqIEBwYXJhbSBjb21wdXRhdGlvbiBDb21wdXRhdGlvbiB0aGF0IHRyYWNrZWRcbiAqIEBwYXJhbSBmdW5jIGFzeW5jIGZ1bmN0aW9uIHRoYXQgbmVlZHMgdG8gYmUgY2FsbGVkIGFuZCBiZSByZWFjdGl2ZVxuICovXG5UcmFja2VyLndpdGhDb21wdXRhdGlvbiA9IGZ1bmN0aW9uIChjb21wdXRhdGlvbiwgZikge1xuICB2YXIgcHJldmlvdXNDb21wdXRhdGlvbiA9IFRyYWNrZXIuY3VycmVudENvbXB1dGF0aW9uO1xuXG4gIFRyYWNrZXIuY3VycmVudENvbXB1dGF0aW9uID0gY29tcHV0YXRpb247XG4gIFRyYWNrZXIuYWN0aXZlID0gISFjb21wdXRhdGlvbjtcblxuICB0cnkge1xuICAgIHJldHVybiBmKCk7XG4gIH0gZmluYWxseSB7XG4gICAgVHJhY2tlci5jdXJyZW50Q29tcHV0YXRpb24gPSBwcmV2aW91c0NvbXB1dGF0aW9uO1xuICAgIFRyYWNrZXIuYWN0aXZlID0gISFwcmV2aW91c0NvbXB1dGF0aW9uO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBhIG5ldyBbYG9uSW52YWxpZGF0ZWBdKCNjb21wdXRhdGlvbl9vbmludmFsaWRhdGUpIGNhbGxiYWNrIG9uIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uICh3aGljaCBtdXN0IGV4aXN0KSwgdG8gYmUgY2FsbGVkIGltbWVkaWF0ZWx5IHdoZW4gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQgb3Igc3RvcHBlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGludm9rZWQgYXMgYGZ1bmMoYylgLCB3aGVyZSBgY2AgaXMgdGhlIGNvbXB1dGF0aW9uIG9uIHdoaWNoIHRoZSBjYWxsYmFjayBpcyByZWdpc3RlcmVkLlxuICovXG5UcmFja2VyLm9uSW52YWxpZGF0ZSA9IGZ1bmN0aW9uIChmKSB7XG4gIGlmICghIFRyYWNrZXIuYWN0aXZlKVxuICAgIHRocm93IG5ldyBFcnJvcihcIlRyYWNrZXIub25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgY3VycmVudENvbXB1dGF0aW9uXCIpO1xuXG4gIFRyYWNrZXIuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmKTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWZ0ZXJmbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFNjaGVkdWxlcyBhIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBkdXJpbmcgdGhlIG5leHQgZmx1c2gsIG9yIGxhdGVyIGluIHRoZSBjdXJyZW50IGZsdXNoIGlmIG9uZSBpcyBpbiBwcm9ncmVzcywgYWZ0ZXIgYWxsIGludmFsaWRhdGVkIGNvbXB1dGF0aW9ucyBoYXZlIGJlZW4gcmVydW4uICBUaGUgZnVuY3Rpb24gd2lsbCBiZSBydW4gb25jZSBhbmQgbm90IG9uIHN1YnNlcXVlbnQgZmx1c2hlcyB1bmxlc3MgYGFmdGVyRmx1c2hgIGlzIGNhbGxlZCBhZ2Fpbi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gY2FsbCBhdCBmbHVzaCB0aW1lLlxuICovXG5UcmFja2VyLmFmdGVyRmx1c2ggPSBmdW5jdGlvbiAoZikge1xuICBhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goZik7XG4gIHJlcXVpcmVGbHVzaCgpO1xufTtcbiJdfQ==
