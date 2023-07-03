(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var ECMAScript = Package.ecmascript.ECMAScript;
var DDPRateLimiter = Package['ddp-rate-limiter'].DDPRateLimiter;
var check = Package.check.check;
var Match = Package.check.Match;
var Random = Package.random.Random;
var EJSON = Package.ejson.EJSON;
var Hook = Package['callback-hook'].Hook;
var URL = Package.url.URL;
var URLSearchParams = Package.url.URLSearchParams;
var DDP = Package['ddp-client'].DDP;
var DDPServer = Package['ddp-server'].DDPServer;
var MongoInternals = Package.mongo.MongoInternals;
var Mongo = Package.mongo.Mongo;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

/* Package-scope variables */
var Accounts, options, stampedLoginToken, handler, name, query, oldestValidDate, user;

var require = meteorInstall({"node_modules":{"meteor":{"accounts-base":{"server_main.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                  //
// packages/accounts-base/server_main.js                                                                            //
//                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                    //
!function (module1) {
  module1.export({
    AccountsServer: () => AccountsServer
  });
  let AccountsServer;
  module1.link("./accounts_server.js", {
    AccountsServer(v) {
      AccountsServer = v;
    }
  }, 0);
  /**
   * @namespace Accounts
   * @summary The namespace for all server-side accounts-related methods.
   */
  Accounts = new AccountsServer(Meteor.server);

  // Users table. Don't use the normal autopublish, since we want to hide
  // some fields. Code to autopublish this is in accounts_server.js.
  // XXX Allow users to configure this collection name.

  /**
   * @summary A [Mongo.Collection](#collections) containing user documents.
   * @locus Anywhere
   * @type {Mongo.Collection}
   * @importFromPackage meteor
  */
  Meteor.users = Accounts.users;
}.call(this, module);
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"accounts_common.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                  //
// packages/accounts-base/accounts_common.js                                                                        //
//                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                    //
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
module.export({
  AccountsCommon: () => AccountsCommon,
  EXPIRE_TOKENS_INTERVAL_MS: () => EXPIRE_TOKENS_INTERVAL_MS
});
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
// config option keys
const VALID_CONFIG_KEYS = ['sendVerificationEmail', 'forbidClientAccountCreation', 'passwordEnrollTokenExpiration', 'passwordEnrollTokenExpirationInDays', 'restrictCreationByEmailDomain', 'loginExpirationInDays', 'loginExpiration', 'passwordResetTokenExpirationInDays', 'passwordResetTokenExpiration', 'ambiguousErrorMessages', 'bcryptRounds', 'defaultFieldSelector', 'loginTokenExpirationHours', 'tokenSequenceLength', 'collection'];

/**
 * @summary Super-constructor for AccountsClient and AccountsServer.
 * @locus Anywhere
 * @class AccountsCommon
 * @instancename accountsClientOrServer
 * @param options {Object} an object with fields:
 * - connection {Object} Optional DDP connection to reuse.
 * - ddpUrl {String} Optional URL for creating a new DDP connection.
 * - collection {String|Mongo.Collection} The name of the Mongo.Collection
 *     or the Mongo.Collection object to hold the users.
 */
class AccountsCommon {
  constructor(options) {
    // Currently this is read directly by packages like accounts-password
    // and accounts-ui-unstyled.
    this._options = {};

    // Note that setting this.connection = null causes this.users to be a
    // LocalCollection, which is not what we want.
    this.connection = undefined;
    this._initConnection(options || {});

    // There is an allow call in accounts_server.js that restricts writes to
    // this collection.
    this.users = this._initializeCollection(options || {});

    // Callback exceptions are printed with Meteor._debug and ignored.
    this._onLoginHook = new Hook({
      bindEnvironment: false,
      debugPrintExceptions: 'onLogin callback'
    });
    this._onLoginFailureHook = new Hook({
      bindEnvironment: false,
      debugPrintExceptions: 'onLoginFailure callback'
    });
    this._onLogoutHook = new Hook({
      bindEnvironment: false,
      debugPrintExceptions: 'onLogout callback'
    });

    // Expose for testing.
    this.DEFAULT_LOGIN_EXPIRATION_DAYS = DEFAULT_LOGIN_EXPIRATION_DAYS;
    this.LOGIN_UNEXPIRING_TOKEN_DAYS = LOGIN_UNEXPIRING_TOKEN_DAYS;

    // Thrown when the user cancels the login process (eg, closes an oauth
    // popup, declines retina scan, etc)
    const lceName = 'Accounts.LoginCancelledError';
    this.LoginCancelledError = Meteor.makeErrorType(lceName, function (description) {
      this.message = description;
    });
    this.LoginCancelledError.prototype.name = lceName;

    // This is used to transmit specific subclass errors over the wire. We
    // should come up with a more generic way to do this (eg, with some sort of
    // symbolic error code rather than a number).
    this.LoginCancelledError.numericError = 0x8acdc2f;
  }
  _initializeCollection(options) {
    if (options.collection && typeof options.collection !== 'string' && !(options.collection instanceof Mongo.Collection)) {
      throw new Meteor.Error('Collection parameter can be only of type string or "Mongo.Collection"');
    }
    let collectionName = 'users';
    if (typeof options.collection === 'string') {
      collectionName = options.collection;
    }
    let collection;
    if (options.collection instanceof Mongo.Collection) {
      collection = options.collection;
    } else {
      collection = new Mongo.Collection(collectionName, {
        _preventAutopublish: true,
        connection: this.connection
      });
    }
    return collection;
  }

  /**
   * @summary Get the current user id, or `null` if no user is logged in. A reactive data source.
   * @locus Anywhere
   */
  userId() {
    throw new Error('userId method not implemented');
  }

  // merge the defaultFieldSelector with an existing options object
  _addDefaultFieldSelector() {
    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    // this will be the most common case for most people, so make it quick
    if (!this._options.defaultFieldSelector) return options;

    // if no field selector then just use defaultFieldSelector
    if (!options.fields) return _objectSpread(_objectSpread({}, options), {}, {
      fields: this._options.defaultFieldSelector
    });

    // if empty field selector then the full user object is explicitly requested, so obey
    const keys = Object.keys(options.fields);
    if (!keys.length) return options;

    // if the requested fields are +ve then ignore defaultFieldSelector
    // assume they are all either +ve or -ve because Mongo doesn't like mixed
    if (!!options.fields[keys[0]]) return options;

    // The requested fields are -ve.
    // If the defaultFieldSelector is +ve then use requested fields, otherwise merge them
    const keys2 = Object.keys(this._options.defaultFieldSelector);
    return this._options.defaultFieldSelector[keys2[0]] ? options : _objectSpread(_objectSpread({}, options), {}, {
      fields: _objectSpread(_objectSpread({}, options.fields), this._options.defaultFieldSelector)
    });
  }

  /**
   * @summary Get the current user record, or `null` if no user is logged in. A reactive data source.
   * @locus Anywhere
   * @param {Object} [options]
   * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
   */
  user(options) {
    const userId = this.userId();
    return userId ? this.users.findOne(userId, this._addDefaultFieldSelector(options)) : null;
  }

  /**
   * @summary Get the current user record, or `null` if no user is logged in.
   * @locus Anywhere
   * @param {Object} [options]
   * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
   */
  userAsync(options) {
    return Promise.asyncApply(() => {
      const userId = this.userId();
      return userId ? this.users.findOneAsync(userId, this._addDefaultFieldSelector(options)) : null;
    });
  }
  // Set up config for the accounts system. Call this on both the client
  // and the server.
  //
  // Note that this method gets overridden on AccountsServer.prototype, but
  // the overriding method calls the overridden method.
  //
  // XXX we should add some enforcement that this is called on both the
  // client and the server. Otherwise, a user can
  // 'forbidClientAccountCreation' only on the client and while it looks
  // like their app is secure, the server will still accept createUser
  // calls. https://github.com/meteor/meteor/issues/828
  //
  // @param options {Object} an object with fields:
  // - sendVerificationEmail {Boolean}
  //     Send email address verification emails to new users created from
  //     client signups.
  // - forbidClientAccountCreation {Boolean}
  //     Do not allow clients to create accounts directly.
  // - restrictCreationByEmailDomain {Function or String}
  //     Require created users to have an email matching the function or
  //     having the string as domain.
  // - loginExpirationInDays {Number}
  //     Number of days since login until a user is logged out (login token
  //     expires).
  // - collection {String|Mongo.Collection}
  //     A collection name or a Mongo.Collection object to hold the users.
  // - passwordResetTokenExpirationInDays {Number}
  //     Number of days since password reset token creation until the
  //     token cannt be used any longer (password reset token expires).
  // - ambiguousErrorMessages {Boolean}
  //     Return ambiguous error messages from login failures to prevent
  //     user enumeration.
  // - bcryptRounds {Number}
  //     Allows override of number of bcrypt rounds (aka work factor) used
  //     to store passwords.

  /**
   * @summary Set global accounts options. You can also set these in `Meteor.settings.packages.accounts` without the need to call this function.
   * @locus Anywhere
   * @param {Object} options
   * @param {Boolean} options.sendVerificationEmail New users with an email address will receive an address verification email.
   * @param {Boolean} options.forbidClientAccountCreation Calls to [`createUser`](#accounts_createuser) from the client will be rejected. In addition, if you are using [accounts-ui](#accountsui), the "Create account" link will not be available.
   * @param {String | Function} options.restrictCreationByEmailDomain If set to a string, only allows new users if the domain part of their email address matches the string. If set to a function, only allows new users if the function returns true.  The function is passed the full email address of the proposed new user.  Works with password-based sign-in and external services that expose email addresses (Google, Facebook, GitHub). All existing users still can log in after enabling this option. Example: `Accounts.config({ restrictCreationByEmailDomain: 'school.edu' })`.
   * @param {Number} options.loginExpirationInDays The number of days from when a user logs in until their token expires and they are logged out. Defaults to 90. Set to `null` to disable login expiration.
   * @param {Number} options.loginExpiration The number of milliseconds from when a user logs in until their token expires and they are logged out, for a more granular control. If `loginExpirationInDays` is set, it takes precedent.
   * @param {String} options.oauthSecretKey When using the `oauth-encryption` package, the 16 byte key using to encrypt sensitive account credentials in the database, encoded in base64.  This option may only be specified on the server.  See packages/oauth-encryption/README.md for details.
   * @param {Number} options.passwordResetTokenExpirationInDays The number of days from when a link to reset password is sent until token expires and user can't reset password with the link anymore. Defaults to 3.
   * @param {Number} options.passwordResetTokenExpiration The number of milliseconds from when a link to reset password is sent until token expires and user can't reset password with the link anymore. If `passwordResetTokenExpirationInDays` is set, it takes precedent.
   * @param {Number} options.passwordEnrollTokenExpirationInDays The number of days from when a link to set initial password is sent until token expires and user can't set password with the link anymore. Defaults to 30.
   * @param {Number} options.passwordEnrollTokenExpiration The number of milliseconds from when a link to set initial password is sent until token expires and user can't set password with the link anymore. If `passwordEnrollTokenExpirationInDays` is set, it takes precedent.
   * @param {Boolean} options.ambiguousErrorMessages Return ambiguous error messages from login failures to prevent user enumeration. Defaults to false.
   * @param {MongoFieldSpecifier} options.defaultFieldSelector To exclude by default large custom fields from `Meteor.user()` and `Meteor.findUserBy...()` functions when called without a field selector, and all `onLogin`, `onLoginFailure` and `onLogout` callbacks.  Example: `Accounts.config({ defaultFieldSelector: { myBigArray: 0 }})`. Beware when using this. If, for instance, you do not include `email` when excluding the fields, you can have problems with functions like `forgotPassword` that will break because they won't have the required data available. It's recommend that you always keep the fields `_id`, `username`, and `email`.
   * @param {String|Mongo.Collection} options.collection A collection name or a Mongo.Collection object to hold the users.
   * @param {Number} options.loginTokenExpirationHours When using the package `accounts-2fa`, use this to set the amount of time a token sent is valid. As it's just a number, you can use, for example, 0.5 to make the token valid for just half hour. The default is 1 hour.
   * @param {Number} options.tokenSequenceLength When using the package `accounts-2fa`, use this to the size of the token sequence generated. The default is 6.
   */
  config(options) {
    // We don't want users to accidentally only call Accounts.config on the
    // client, where some of the options will have partial effects (eg removing
    // the "create account" button from accounts-ui if forbidClientAccountCreation
    // is set, or redirecting Google login to a specific-domain page) without
    // having their full effects.
    if (Meteor.isServer) {
      __meteor_runtime_config__.accountsConfigCalled = true;
    } else if (!__meteor_runtime_config__.accountsConfigCalled) {
      // XXX would be nice to "crash" the client and replace the UI with an error
      // message, but there's no trivial way to do this.
      Meteor._debug('Accounts.config was called on the client but not on the ' + 'server; some configuration options may not take effect.');
    }

    // We need to validate the oauthSecretKey option at the time
    // Accounts.config is called. We also deliberately don't store the
    // oauthSecretKey in Accounts._options.
    if (Object.prototype.hasOwnProperty.call(options, 'oauthSecretKey')) {
      if (Meteor.isClient) {
        throw new Error('The oauthSecretKey option may only be specified on the server');
      }
      if (!Package['oauth-encryption']) {
        throw new Error('The oauth-encryption package must be loaded to set oauthSecretKey');
      }
      Package['oauth-encryption'].OAuthEncryption.loadKey(options.oauthSecretKey);
      options = _objectSpread({}, options);
      delete options.oauthSecretKey;
    }

    // Validate config options keys
    Object.keys(options).forEach(key => {
      if (!VALID_CONFIG_KEYS.includes(key)) {
        // TODO Consider just logging a debug message instead to allow for additional keys in the settings here?
        throw new Meteor.Error("Accounts.config: Invalid key: ".concat(key));
      }
    });

    // set values in Accounts._options
    VALID_CONFIG_KEYS.forEach(key => {
      if (key in options) {
        if (key in this._options) {
          if (key !== 'collection') {
            throw new Meteor.Error("Can't set `".concat(key, "` more than once"));
          }
        }
        this._options[key] = options[key];
      }
    });
    if (options.collection && options.collection !== this.users._name && options.collection !== this.users) {
      this.users = this._initializeCollection(options);
    }
  }

  /**
   * @summary Register a callback to be called after a login attempt succeeds.
   * @locus Anywhere
   * @param {Function} func The callback to be called when login is successful.
   *                        The callback receives a single object that
   *                        holds login details. This object contains the login
   *                        result type (password, resume, etc.) on both the
   *                        client and server. `onLogin` callbacks registered
   *                        on the server also receive extra data, such
   *                        as user details, connection information, etc.
   */
  onLogin(func) {
    let ret = this._onLoginHook.register(func);
    // call the just registered callback if already logged in
    this._startupCallback(ret.callback);
    return ret;
  }

  /**
   * @summary Register a callback to be called after a login attempt fails.
   * @locus Anywhere
   * @param {Function} func The callback to be called after the login has failed.
   */
  onLoginFailure(func) {
    return this._onLoginFailureHook.register(func);
  }

  /**
   * @summary Register a callback to be called after a logout attempt succeeds.
   * @locus Anywhere
   * @param {Function} func The callback to be called when logout is successful.
   */
  onLogout(func) {
    return this._onLogoutHook.register(func);
  }
  _initConnection(options) {
    if (!Meteor.isClient) {
      return;
    }

    // The connection used by the Accounts system. This is the connection
    // that will get logged in by Meteor.login(), and this is the
    // connection whose login state will be reflected by Meteor.userId().
    //
    // It would be much preferable for this to be in accounts_client.js,
    // but it has to be here because it's needed to create the
    // Meteor.users collection.
    if (options.connection) {
      this.connection = options.connection;
    } else if (options.ddpUrl) {
      this.connection = DDP.connect(options.ddpUrl);
    } else if (typeof __meteor_runtime_config__ !== 'undefined' && __meteor_runtime_config__.ACCOUNTS_CONNECTION_URL) {
      // Temporary, internal hook to allow the server to point the client
      // to a different authentication server. This is for a very
      // particular use case that comes up when implementing a oauth
      // server. Unsupported and may go away at any point in time.
      //
      // We will eventually provide a general way to use account-base
      // against any DDP connection, not just one special one.
      this.connection = DDP.connect(__meteor_runtime_config__.ACCOUNTS_CONNECTION_URL);
    } else {
      this.connection = Meteor.connection;
    }
  }
  _getTokenLifetimeMs() {
    // When loginExpirationInDays is set to null, we'll use a really high
    // number of days (LOGIN_UNEXPIRABLE_TOKEN_DAYS) to simulate an
    // unexpiring token.
    const loginExpirationInDays = this._options.loginExpirationInDays === null ? LOGIN_UNEXPIRING_TOKEN_DAYS : this._options.loginExpirationInDays;
    return this._options.loginExpiration || (loginExpirationInDays || DEFAULT_LOGIN_EXPIRATION_DAYS) * 86400000;
  }
  _getPasswordResetTokenLifetimeMs() {
    return this._options.passwordResetTokenExpiration || (this._options.passwordResetTokenExpirationInDays || DEFAULT_PASSWORD_RESET_TOKEN_EXPIRATION_DAYS) * 86400000;
  }
  _getPasswordEnrollTokenLifetimeMs() {
    return this._options.passwordEnrollTokenExpiration || (this._options.passwordEnrollTokenExpirationInDays || DEFAULT_PASSWORD_ENROLL_TOKEN_EXPIRATION_DAYS) * 86400000;
  }
  _tokenExpiration(when) {
    // We pass when through the Date constructor for backwards compatibility;
    // `when` used to be a number.
    return new Date(new Date(when).getTime() + this._getTokenLifetimeMs());
  }
  _tokenExpiresSoon(when) {
    let minLifetimeMs = 0.1 * this._getTokenLifetimeMs();
    const minLifetimeCapMs = MIN_TOKEN_LIFETIME_CAP_SECS * 1000;
    if (minLifetimeMs > minLifetimeCapMs) {
      minLifetimeMs = minLifetimeCapMs;
    }
    return new Date() > new Date(when) - minLifetimeMs;
  }

  // No-op on the server, overridden on the client.
  _startupCallback(callback) {}
}
// Note that Accounts is defined separately in accounts_client.js and
// accounts_server.js.

/**
 * @summary Get the current user id, or `null` if no user is logged in. A reactive data source.
 * @locus Anywhere but publish functions
 * @importFromPackage meteor
 */
Meteor.userId = () => Accounts.userId();

/**
 * @summary Get the current user record, or `null` if no user is logged in. A reactive data source.
 * @locus Anywhere but publish functions
 * @importFromPackage meteor
 * @param {Object} [options]
 * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
 */
Meteor.user = options => Accounts.user(options);

/**
 * @summary Get the current user record, or `null` if no user is logged in. A reactive data source.
 * @locus Anywhere but publish functions
 * @importFromPackage meteor
 * @param {Object} [options]
 * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
 */
Meteor.userAsync = options => Accounts.userAsync(options);

// how long (in days) until a login token expires
const DEFAULT_LOGIN_EXPIRATION_DAYS = 90;
// how long (in days) until reset password token expires
const DEFAULT_PASSWORD_RESET_TOKEN_EXPIRATION_DAYS = 3;
// how long (in days) until enrol password token expires
const DEFAULT_PASSWORD_ENROLL_TOKEN_EXPIRATION_DAYS = 30;
// Clients don't try to auto-login with a token that is going to expire within
// .1 * DEFAULT_LOGIN_EXPIRATION_DAYS, capped at MIN_TOKEN_LIFETIME_CAP_SECS.
// Tries to avoid abrupt disconnects from expiring tokens.
const MIN_TOKEN_LIFETIME_CAP_SECS = 3600; // one hour
// how often (in milliseconds) we check for expired tokens
const EXPIRE_TOKENS_INTERVAL_MS = 600 * 1000;
// 10 minutes
// A large number of expiration days (approximately 100 years worth) that is
// used when creating unexpiring tokens.
const LOGIN_UNEXPIRING_TOKEN_DAYS = 365 * 100;
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"accounts_server.js":function module(require,exports,module){

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                  //
// packages/accounts-base/accounts_server.js                                                                        //
//                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                    //
var _Package$oauthEncryp;
const _excluded = ["token"];
let _objectWithoutProperties;
module.link("@babel/runtime/helpers/objectWithoutProperties", {
  default(v) {
    _objectWithoutProperties = v;
  }
}, 0);
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 1);
module.export({
  AccountsServer: () => AccountsServer
});
let crypto;
module.link("crypto", {
  default(v) {
    crypto = v;
  }
}, 0);
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 1);
let AccountsCommon, EXPIRE_TOKENS_INTERVAL_MS;
module.link("./accounts_common.js", {
  AccountsCommon(v) {
    AccountsCommon = v;
  },
  EXPIRE_TOKENS_INTERVAL_MS(v) {
    EXPIRE_TOKENS_INTERVAL_MS = v;
  }
}, 2);
let URL;
module.link("meteor/url", {
  URL(v) {
    URL = v;
  }
}, 3);
const hasOwn = Object.prototype.hasOwnProperty;

// XXX maybe this belongs in the check package
const NonEmptyString = Match.Where(x => {
  check(x, String);
  return x.length > 0;
});

/**
 * @summary Constructor for the `Accounts` namespace on the server.
 * @locus Server
 * @class AccountsServer
 * @extends AccountsCommon
 * @instancename accountsServer
 * @param {Object} server A server object such as `Meteor.server`.
 */
class AccountsServer extends AccountsCommon {
  // Note that this constructor is less likely to be instantiated multiple
  // times than the `AccountsClient` constructor, because a single server
  // can provide only one set of methods.
  constructor(server, _options) {
    var _this;
    super(_options || {});
    _this = this;
    this.onCreateLoginToken = function (func) {
      if (this._onCreateLoginTokenHook) {
        throw new Error('Can only call onCreateLoginToken once');
      }
      this._onCreateLoginTokenHook = func;
    };
    this._selectorForFastCaseInsensitiveLookup = (fieldName, string) => {
      // Performance seems to improve up to 4 prefix characters
      const prefix = string.substring(0, Math.min(string.length, 4));
      const orClause = generateCasePermutationsForString(prefix).map(prefixPermutation => {
        const selector = {};
        selector[fieldName] = new RegExp("^".concat(Meteor._escapeRegExp(prefixPermutation)));
        return selector;
      });
      const caseInsensitiveClause = {};
      caseInsensitiveClause[fieldName] = new RegExp("^".concat(Meteor._escapeRegExp(string), "$"), 'i');
      return {
        $and: [{
          $or: orClause
        }, caseInsensitiveClause]
      };
    };
    this._findUserByQuery = (query, options) => {
      let user = null;
      if (query.id) {
        // default field selector is added within getUserById()
        user = Meteor.users.findOne(query.id, this._addDefaultFieldSelector(options));
      } else {
        options = this._addDefaultFieldSelector(options);
        let fieldName;
        let fieldValue;
        if (query.username) {
          fieldName = 'username';
          fieldValue = query.username;
        } else if (query.email) {
          fieldName = 'emails.address';
          fieldValue = query.email;
        } else {
          throw new Error("shouldn't happen (validation missed something)");
        }
        let selector = {};
        selector[fieldName] = fieldValue;
        user = Meteor.users.findOne(selector, options);
        // If user is not found, try a case insensitive lookup
        if (!user) {
          selector = this._selectorForFastCaseInsensitiveLookup(fieldName, fieldValue);
          const candidateUsers = Meteor.users.find(selector, _objectSpread(_objectSpread({}, options), {}, {
            limit: 2
          })).fetch();
          // No match if multiple candidates are found
          if (candidateUsers.length === 1) {
            user = candidateUsers[0];
          }
        }
      }
      return user;
    };
    this._handleError = function (msg) {
      let throwError = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
      let errorCode = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 403;
      const error = new Meteor.Error(errorCode, _this._options.ambiguousErrorMessages ? "Something went wrong. Please check your credentials." : msg);
      if (throwError) {
        throw error;
      }
      return error;
    };
    this._userQueryValidator = Match.Where(user => {
      check(user, {
        id: Match.Optional(NonEmptyString),
        username: Match.Optional(NonEmptyString),
        email: Match.Optional(NonEmptyString)
      });
      if (Object.keys(user).length !== 1) throw new Match.Error("User property must have exactly one field");
      return true;
    });
    this._server = server || Meteor.server;
    // Set up the server's methods, as if by calling Meteor.methods.
    this._initServerMethods();
    this._initAccountDataHooks();

    // If autopublish is on, publish these user fields. Login service
    // packages (eg accounts-google) add to these by calling
    // addAutopublishFields.  Notably, this isn't implemented with multiple
    // publishes since DDP only merges only across top-level fields, not
    // subfields (such as 'services.facebook.accessToken')
    this._autopublishFields = {
      loggedInUser: ['profile', 'username', 'emails'],
      otherUsers: ['profile', 'username']
    };

    // use object to keep the reference when used in functions
    // where _defaultPublishFields is destructured into lexical scope
    // for publish callbacks that need `this`
    this._defaultPublishFields = {
      projection: {
        profile: 1,
        username: 1,
        emails: 1
      }
    };
    this._initServerPublications();

    // connectionId -> {connection, loginToken}
    this._accountData = {};

    // connection id -> observe handle for the login token that this connection is
    // currently associated with, or a number. The number indicates that we are in
    // the process of setting up the observe (using a number instead of a single
    // sentinel allows multiple attempts to set up the observe to identify which
    // one was theirs).
    this._userObservesForConnections = {};
    this._nextUserObserveNumber = 1; // for the number described above.

    // list of all registered handlers.
    this._loginHandlers = [];
    setupUsersCollection(this.users);
    setupDefaultLoginHandlers(this);
    setExpireTokensInterval(this);
    this._validateLoginHook = new Hook({
      bindEnvironment: false
    });
    this._validateNewUserHooks = [defaultValidateNewUserHook.bind(this)];
    this._deleteSavedTokensForAllUsersOnStartup();
    this._skipCaseInsensitiveChecksForTest = {};
    this.urls = {
      resetPassword: (token, extraParams) => this.buildEmailUrl("#/reset-password/".concat(token), extraParams),
      verifyEmail: (token, extraParams) => this.buildEmailUrl("#/verify-email/".concat(token), extraParams),
      loginToken: (selector, token, extraParams) => this.buildEmailUrl("/?loginToken=".concat(token, "&selector=").concat(selector), extraParams),
      enrollAccount: (token, extraParams) => this.buildEmailUrl("#/enroll-account/".concat(token), extraParams)
    };
    this.addDefaultRateLimit();
    this.buildEmailUrl = function (path) {
      let extraParams = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      const url = new URL(Meteor.absoluteUrl(path));
      const params = Object.entries(extraParams);
      if (params.length > 0) {
        // Add additional parameters to the url
        for (const [key, value] of params) {
          url.searchParams.append(key, value);
        }
      }
      return url.toString();
    };
  }

  ///
  /// CURRENT USER
  ///

  // @override of "abstract" non-implementation in accounts_common.js
  userId() {
    // This function only works if called inside a method or a pubication.
    // Using any of the information from Meteor.user() in a method or
    // publish function will always use the value from when the function first
    // runs. This is likely not what the user expects. The way to make this work
    // in a method or publish function is to do Meteor.find(this.userId).observe
    // and recompute when the user record changes.
    const currentInvocation = DDP._CurrentMethodInvocation.get() || DDP._CurrentPublicationInvocation.get();
    if (!currentInvocation) throw new Error("Meteor.userId can only be invoked in method calls or publications.");
    return currentInvocation.userId;
  }

  ///
  /// LOGIN HOOKS
  ///

  /**
   * @summary Validate login attempts.
   * @locus Server
   * @param {Function} func Called whenever a login is attempted (either successful or unsuccessful).  A login can be aborted by returning a falsy value or throwing an exception.
   */
  validateLoginAttempt(func) {
    // Exceptions inside the hook callback are passed up to us.
    return this._validateLoginHook.register(func);
  }

  /**
   * @summary Set restrictions on new user creation.
   * @locus Server
   * @param {Function} func Called whenever a new user is created. Takes the new user object, and returns true to allow the creation or false to abort.
   */
  validateNewUser(func) {
    this._validateNewUserHooks.push(func);
  }

  /**
   * @summary Validate login from external service
   * @locus Server
   * @param {Function} func Called whenever login/user creation from external service is attempted. Login or user creation based on this login can be aborted by passing a falsy value or throwing an exception.
   */
  beforeExternalLogin(func) {
    if (this._beforeExternalLoginHook) {
      throw new Error("Can only call beforeExternalLogin once");
    }
    this._beforeExternalLoginHook = func;
  }

  ///
  /// CREATE USER HOOKS
  ///

  /**
   * @summary Customize login token creation.
   * @locus Server
   * @param {Function} func Called whenever a new token is created.
   * Return the sequence and the user object. Return true to keep sending the default email, or false to override the behavior.
   */

  /**
   * @summary Customize new user creation.
   * @locus Server
   * @param {Function} func Called whenever a new user is created. Return the new user object, or throw an `Error` to abort the creation.
   */
  onCreateUser(func) {
    if (this._onCreateUserHook) {
      throw new Error("Can only call onCreateUser once");
    }
    this._onCreateUserHook = Meteor.wrapFn(func);
  }

  /**
   * @summary Customize oauth user profile updates
   * @locus Server
   * @param {Function} func Called whenever a user is logged in via oauth. Return the profile object to be merged, or throw an `Error` to abort the creation.
   */
  onExternalLogin(func) {
    if (this._onExternalLoginHook) {
      throw new Error("Can only call onExternalLogin once");
    }
    this._onExternalLoginHook = func;
  }

  /**
   * @summary Customize user selection on external logins
   * @locus Server
   * @param {Function} func Called whenever a user is logged in via oauth and a
   * user is not found with the service id. Return the user or undefined.
   */
  setAdditionalFindUserOnExternalLogin(func) {
    if (this._additionalFindUserOnExternalLogin) {
      throw new Error("Can only call setAdditionalFindUserOnExternalLogin once");
    }
    this._additionalFindUserOnExternalLogin = func;
  }
  _validateLogin(connection, attempt) {
    this._validateLoginHook.forEach(callback => {
      let ret;
      try {
        ret = callback(cloneAttemptWithConnection(connection, attempt));
      } catch (e) {
        attempt.allowed = false;
        // XXX this means the last thrown error overrides previous error
        // messages. Maybe this is surprising to users and we should make
        // overriding errors more explicit. (see
        // https://github.com/meteor/meteor/issues/1960)
        attempt.error = e;
        return true;
      }
      if (!ret) {
        attempt.allowed = false;
        // don't override a specific error provided by a previous
        // validator or the initial attempt (eg "incorrect password").
        if (!attempt.error) attempt.error = new Meteor.Error(403, "Login forbidden");
      }
      return true;
    });
  }
  _successfulLogin(connection, attempt) {
    this._onLoginHook.each(callback => {
      callback(cloneAttemptWithConnection(connection, attempt));
      return true;
    });
  }
  _failedLogin(connection, attempt) {
    this._onLoginFailureHook.each(callback => {
      callback(cloneAttemptWithConnection(connection, attempt));
      return true;
    });
  }
  _successfulLogout(connection, userId) {
    // don't fetch the user object unless there are some callbacks registered
    let user;
    this._onLogoutHook.each(callback => {
      if (!user && userId) user = this.users.findOne(userId, {
        fields: this._options.defaultFieldSelector
      });
      callback({
        user,
        connection
      });
      return true;
    });
  }
  ///
  /// LOGIN METHODS
  ///

  // Login methods return to the client an object containing these
  // fields when the user was logged in successfully:
  //
  //   id: userId
  //   token: *
  //   tokenExpires: *
  //
  // tokenExpires is optional and intends to provide a hint to the
  // client as to when the token will expire. If not provided, the
  // client will call Accounts._tokenExpiration, passing it the date
  // that it received the token.
  //
  // The login method will throw an error back to the client if the user
  // failed to log in.
  //
  //
  // Login handlers and service specific login methods such as
  // `createUser` internally return a `result` object containing these
  // fields:
  //
  //   type:
  //     optional string; the service name, overrides the handler
  //     default if present.
  //
  //   error:
  //     exception; if the user is not allowed to login, the reason why.
  //
  //   userId:
  //     string; the user id of the user attempting to login (if
  //     known), required for an allowed login.
  //
  //   options:
  //     optional object merged into the result returned by the login
  //     method; used by HAMK from SRP.
  //
  //   stampedLoginToken:
  //     optional object with `token` and `when` indicating the login
  //     token is already present in the database, returned by the
  //     "resume" login handler.
  //
  // For convenience, login methods can also throw an exception, which
  // is converted into an {error} result.  However, if the id of the
  // user attempting the login is known, a {userId, error} result should
  // be returned instead since the user id is not captured when an
  // exception is thrown.
  //
  // This internal `result` object is automatically converted into the
  // public {id, token, tokenExpires} object returned to the client.

  // Try a login method, converting thrown exceptions into an {error}
  // result.  The `type` argument is a default, inserted into the result
  // object if not explicitly returned.
  //
  // Log in a user on a connection.
  //
  // We use the method invocation to set the user id on the connection,
  // not the connection object directly. setUserId is tied to methods to
  // enforce clear ordering of method application (using wait methods on
  // the client, and a no setUserId after unblock restriction on the
  // server)
  //
  // The `stampedLoginToken` parameter is optional.  When present, it
  // indicates that the login token has already been inserted into the
  // database and doesn't need to be inserted again.  (It's used by the
  // "resume" login handler).
  _loginUser(methodInvocation, userId, stampedLoginToken) {
    if (!stampedLoginToken) {
      stampedLoginToken = this._generateStampedLoginToken();
      this._insertLoginToken(userId, stampedLoginToken);
    }

    // This order (and the avoidance of yields) is important to make
    // sure that when publish functions are rerun, they see a
    // consistent view of the world: the userId is set and matches
    // the login token on the connection (not that there is
    // currently a public API for reading the login token on a
    // connection).
    Meteor._noYieldsAllowed(() => this._setLoginToken(userId, methodInvocation.connection, this._hashLoginToken(stampedLoginToken.token)));
    methodInvocation.setUserId(userId);
    return {
      id: userId,
      token: stampedLoginToken.token,
      tokenExpires: this._tokenExpiration(stampedLoginToken.when)
    };
  }
  // After a login method has completed, call the login hooks.  Note
  // that `attemptLogin` is called for *all* login attempts, even ones
  // which aren't successful (such as an invalid password, etc).
  //
  // If the login is allowed and isn't aborted by a validate login hook
  // callback, log in the user.
  //
  _attemptLogin(methodInvocation, methodName, methodArgs, result) {
    return Promise.asyncApply(() => {
      if (!result) throw new Error("result is required");

      // XXX A programming error in a login handler can lead to this occurring, and
      // then we don't call onLogin or onLoginFailure callbacks. Should
      // tryLoginMethod catch this case and turn it into an error?
      if (!result.userId && !result.error) throw new Error("A login method must specify a userId or an error");
      let user;
      if (result.userId) user = this.users.findOne(result.userId, {
        fields: this._options.defaultFieldSelector
      });
      const attempt = {
        type: result.type || "unknown",
        allowed: !!(result.userId && !result.error),
        methodName: methodName,
        methodArguments: Array.from(methodArgs)
      };
      if (result.error) {
        attempt.error = result.error;
      }
      if (user) {
        attempt.user = user;
      }

      // _validateLogin may mutate `attempt` by adding an error and changing allowed
      // to false, but that's the only change it can make (and the user's callbacks
      // only get a clone of `attempt`).
      this._validateLogin(methodInvocation.connection, attempt);
      if (attempt.allowed) {
        const ret = _objectSpread(_objectSpread({}, this._loginUser(methodInvocation, result.userId, result.stampedLoginToken)), result.options);
        ret.type = attempt.type;
        this._successfulLogin(methodInvocation.connection, attempt);
        return ret;
      } else {
        this._failedLogin(methodInvocation.connection, attempt);
        throw attempt.error;
      }
    });
  }
  // All service specific login methods should go through this function.
  // Ensure that thrown exceptions are caught and that login hook
  // callbacks are still called.
  //
  _loginMethod(methodInvocation, methodName, methodArgs, type, fn) {
    return Promise.asyncApply(() => {
      return Promise.await(this._attemptLogin(methodInvocation, methodName, methodArgs, Promise.await(tryLoginMethod(type, fn))));
    });
  }
  // Report a login attempt failed outside the context of a normal login
  // method. This is for use in the case where there is a multi-step login
  // procedure (eg SRP based password login). If a method early in the
  // chain fails, it should call this function to report a failure. There
  // is no corresponding method for a successful login; methods that can
  // succeed at logging a user in should always be actual login methods
  // (using either Accounts._loginMethod or Accounts.registerLoginHandler).
  _reportLoginFailure(methodInvocation, methodName, methodArgs, result) {
    const attempt = {
      type: result.type || "unknown",
      allowed: false,
      error: result.error,
      methodName: methodName,
      methodArguments: Array.from(methodArgs)
    };
    if (result.userId) {
      attempt.user = this.users.findOne(result.userId, {
        fields: this._options.defaultFieldSelector
      });
    }
    this._validateLogin(methodInvocation.connection, attempt);
    this._failedLogin(methodInvocation.connection, attempt);

    // _validateLogin may mutate attempt to set a new error message. Return
    // the modified version.
    return attempt;
  }
  ///
  /// LOGIN HANDLERS
  ///

  /**
   * @summary Registers a new login handler.
   * @locus Server
   * @param {String} [name] The type of login method like oauth, password, etc.
   * @param {Function} handler A function that receives an options object
   * (as passed as an argument to the `login` method) and returns one of
   * `undefined`, meaning don't handle or a login method result object.
   */
  registerLoginHandler(name, handler) {
    if (!handler) {
      handler = name;
      name = null;
    }
    this._loginHandlers.push({
      name: name,
      handler: Meteor.wrapFn(handler)
    });
  }
  // Checks a user's credentials against all the registered login
  // handlers, and returns a login token if the credentials are valid. It
  // is like the login method, except that it doesn't set the logged-in
  // user on the connection. Throws a Meteor.Error if logging in fails,
  // including the case where none of the login handlers handled the login
  // request. Otherwise, returns {id: userId, token: *, tokenExpires: *}.
  //
  // For example, if you want to login with a plaintext password, `options` could be
  //   { user: { username: <username> }, password: <password> }, or
  //   { user: { email: <email> }, password: <password> }.

  // Try all of the registered login handlers until one of them doesn't
  // return `undefined`, meaning it handled this call to `login`. Return
  // that return value.
  _runLoginHandlers(methodInvocation, options) {
    return Promise.asyncApply(() => {
      for (let handler of this._loginHandlers) {
        const result = Promise.await(tryLoginMethod(handler.name, () => Promise.asyncApply(() => Promise.await(handler.handler.call(methodInvocation, options)))));
        if (result) {
          return result;
        }
        if (result !== undefined) {
          throw new Meteor.Error(400, 'A login handler should return a result or undefined');
        }
      }
      return {
        type: null,
        error: new Meteor.Error(400, "Unrecognized options for login request")
      };
    });
  }
  // Deletes the given loginToken from the database.
  //
  // For new-style hashed token, this will cause all connections
  // associated with the token to be closed.
  //
  // Any connections associated with old-style unhashed tokens will be
  // in the process of becoming associated with hashed tokens and then
  // they'll get closed.
  destroyToken(userId, loginToken) {
    this.users.update(userId, {
      $pull: {
        "services.resume.loginTokens": {
          $or: [{
            hashedToken: loginToken
          }, {
            token: loginToken
          }]
        }
      }
    });
  }
  _initServerMethods() {
    // The methods created in this function need to be created here so that
    // this variable is available in their scope.
    const accounts = this;

    // This object will be populated with methods and then passed to
    // accounts._server.methods further below.
    const methods = {};

    // @returns {Object|null}
    //   If successful, returns {token: reconnectToken, id: userId}
    //   If unsuccessful (for example, if the user closed the oauth login popup),
    //     throws an error describing the reason
    methods.login = function (options) {
      return Promise.asyncApply(() => {
        // Login handlers should really also check whatever field they look at in
        // options, but we don't enforce it.
        check(options, Object);
        const result = Promise.await(accounts._runLoginHandlers(this, options));
        //console.log({result});

        return Promise.await(accounts._attemptLogin(this, "login", arguments, result));
      });
    };
    methods.logout = function () {
      const token = accounts._getLoginToken(this.connection.id);
      accounts._setLoginToken(this.userId, this.connection, null);
      if (token && this.userId) {
        accounts.destroyToken(this.userId, token);
      }
      accounts._successfulLogout(this.connection, this.userId);
      this.setUserId(null);
    };

    // Generates a new login token with the same expiration as the
    // connection's current token and saves it to the database. Associates
    // the connection with this new token and returns it. Throws an error
    // if called on a connection that isn't logged in.
    //
    // @returns Object
    //   If successful, returns { token: <new token>, id: <user id>,
    //   tokenExpires: <expiration date> }.
    methods.getNewToken = function () {
      const user = accounts.users.findOne(this.userId, {
        fields: {
          "services.resume.loginTokens": 1
        }
      });
      if (!this.userId || !user) {
        throw new Meteor.Error("You are not logged in.");
      }
      // Be careful not to generate a new token that has a later
      // expiration than the curren token. Otherwise, a bad guy with a
      // stolen token could use this method to stop his stolen token from
      // ever expiring.
      const currentHashedToken = accounts._getLoginToken(this.connection.id);
      const currentStampedToken = user.services.resume.loginTokens.find(stampedToken => stampedToken.hashedToken === currentHashedToken);
      if (!currentStampedToken) {
        // safety belt: this should never happen
        throw new Meteor.Error("Invalid login token");
      }
      const newStampedToken = accounts._generateStampedLoginToken();
      newStampedToken.when = currentStampedToken.when;
      accounts._insertLoginToken(this.userId, newStampedToken);
      return accounts._loginUser(this, this.userId, newStampedToken);
    };

    // Removes all tokens except the token associated with the current
    // connection. Throws an error if the connection is not logged
    // in. Returns nothing on success.
    methods.removeOtherTokens = function () {
      if (!this.userId) {
        throw new Meteor.Error("You are not logged in.");
      }
      const currentToken = accounts._getLoginToken(this.connection.id);
      accounts.users.update(this.userId, {
        $pull: {
          "services.resume.loginTokens": {
            hashedToken: {
              $ne: currentToken
            }
          }
        }
      });
    };

    // Allow a one-time configuration for a login service. Modifications
    // to this collection are also allowed in insecure mode.
    methods.configureLoginService = options => {
      check(options, Match.ObjectIncluding({
        service: String
      }));
      // Don't let random users configure a service we haven't added yet (so
      // that when we do later add it, it's set up with their configuration
      // instead of ours).
      // XXX if service configuration is oauth-specific then this code should
      //     be in accounts-oauth; if it's not then the registry should be
      //     in this package
      if (!(accounts.oauth && accounts.oauth.serviceNames().includes(options.service))) {
        throw new Meteor.Error(403, "Service unknown");
      }
      if (Package['service-configuration']) {
        const {
          ServiceConfiguration
        } = Package['service-configuration'];
        if (ServiceConfiguration.configurations.findOne({
          service: options.service
        })) throw new Meteor.Error(403, "Service ".concat(options.service, " already configured"));
        if (Package["oauth-encryption"]) {
          const {
            OAuthEncryption
          } = Package["oauth-encryption"];
          if (hasOwn.call(options, 'secret') && OAuthEncryption.keyIsLoaded()) options.secret = OAuthEncryption.seal(options.secret);
        }
        ServiceConfiguration.configurations.insert(options);
      }
    };
    accounts._server.methods(methods);
  }
  _initAccountDataHooks() {
    this._server.onConnection(connection => {
      this._accountData[connection.id] = {
        connection: connection
      };
      connection.onClose(() => {
        this._removeTokenFromConnection(connection.id);
        delete this._accountData[connection.id];
      });
    });
  }
  _initServerPublications() {
    // Bring into lexical scope for publish callbacks that need `this`
    const {
      users,
      _autopublishFields,
      _defaultPublishFields
    } = this;

    // Publish all login service configuration fields other than secret.
    this._server.publish("meteor.loginServiceConfiguration", function () {
      if (Package['service-configuration']) {
        const {
          ServiceConfiguration
        } = Package['service-configuration'];
        return ServiceConfiguration.configurations.find({}, {
          fields: {
            secret: 0
          }
        });
      }
      this.ready();
    }, {
      is_auto: true
    }); // not technically autopublish, but stops the warning.

    // Use Meteor.startup to give other packages a chance to call
    // setDefaultPublishFields.
    Meteor.startup(() => {
      // Merge custom fields selector and default publish fields so that the client
      // gets all the necessary fields to run properly
      const customFields = this._addDefaultFieldSelector().fields || {};
      const keys = Object.keys(customFields);
      // If the custom fields are negative, then ignore them and only send the necessary fields
      const fields = keys.length > 0 && customFields[keys[0]] ? _objectSpread(_objectSpread({}, this._addDefaultFieldSelector().fields), _defaultPublishFields.projection) : _defaultPublishFields.projection;
      // Publish the current user's record to the client.
      this._server.publish(null, function () {
        if (this.userId) {
          return users.find({
            _id: this.userId
          }, {
            fields
          });
        } else {
          return null;
        }
      }, /*suppress autopublish warning*/{
        is_auto: true
      });
    });

    // Use Meteor.startup to give other packages a chance to call
    // addAutopublishFields.
    Package.autopublish && Meteor.startup(() => {
      // ['profile', 'username'] -> {profile: 1, username: 1}
      const toFieldSelector = fields => fields.reduce((prev, field) => _objectSpread(_objectSpread({}, prev), {}, {
        [field]: 1
      }), {});
      this._server.publish(null, function () {
        if (this.userId) {
          return users.find({
            _id: this.userId
          }, {
            fields: toFieldSelector(_autopublishFields.loggedInUser)
          });
        } else {
          return null;
        }
      }, /*suppress autopublish warning*/{
        is_auto: true
      });

      // XXX this publish is neither dedup-able nor is it optimized by our special
      // treatment of queries on a specific _id. Therefore this will have O(n^2)
      // run-time performance every time a user document is changed (eg someone
      // logging in). If this is a problem, we can instead write a manual publish
      // function which filters out fields based on 'this.userId'.
      this._server.publish(null, function () {
        const selector = this.userId ? {
          _id: {
            $ne: this.userId
          }
        } : {};
        return users.find(selector, {
          fields: toFieldSelector(_autopublishFields.otherUsers)
        });
      }, /*suppress autopublish warning*/{
        is_auto: true
      });
    });
  }
  // Add to the list of fields or subfields to be automatically
  // published if autopublish is on. Must be called from top-level
  // code (ie, before Meteor.startup hooks run).
  //
  // @param opts {Object} with:
  //   - forLoggedInUser {Array} Array of fields published to the logged-in user
  //   - forOtherUsers {Array} Array of fields published to users that aren't logged in
  addAutopublishFields(opts) {
    this._autopublishFields.loggedInUser.push.apply(this._autopublishFields.loggedInUser, opts.forLoggedInUser);
    this._autopublishFields.otherUsers.push.apply(this._autopublishFields.otherUsers, opts.forOtherUsers);
  }
  // Replaces the fields to be automatically
  // published when the user logs in
  //
  // @param {MongoFieldSpecifier} fields Dictionary of fields to return or exclude.
  setDefaultPublishFields(fields) {
    this._defaultPublishFields.projection = fields;
  }
  ///
  /// ACCOUNT DATA
  ///

  // HACK: This is used by 'meteor-accounts' to get the loginToken for a
  // connection. Maybe there should be a public way to do that.
  _getAccountData(connectionId, field) {
    const data = this._accountData[connectionId];
    return data && data[field];
  }
  _setAccountData(connectionId, field, value) {
    const data = this._accountData[connectionId];

    // safety belt. shouldn't happen. accountData is set in onConnection,
    // we don't have a connectionId until it is set.
    if (!data) return;
    if (value === undefined) delete data[field];else data[field] = value;
  }
  ///
  /// RECONNECT TOKENS
  ///
  /// support reconnecting using a meteor login token

  _hashLoginToken(loginToken) {
    const hash = crypto.createHash('sha256');
    hash.update(loginToken);
    return hash.digest('base64');
  }
  // {token, when} => {hashedToken, when}
  _hashStampedToken(stampedToken) {
    const {
        token
      } = stampedToken,
      hashedStampedToken = _objectWithoutProperties(stampedToken, _excluded);
    return _objectSpread(_objectSpread({}, hashedStampedToken), {}, {
      hashedToken: this._hashLoginToken(token)
    });
  }
  // Using $addToSet avoids getting an index error if another client
  // logging in simultaneously has already inserted the new hashed
  // token.
  _insertHashedLoginToken(userId, hashedToken, query) {
    query = query ? _objectSpread({}, query) : {};
    query._id = userId;
    this.users.update(query, {
      $addToSet: {
        "services.resume.loginTokens": hashedToken
      }
    });
  }
  // Exported for tests.
  _insertLoginToken(userId, stampedToken, query) {
    this._insertHashedLoginToken(userId, this._hashStampedToken(stampedToken), query);
  }
  _clearAllLoginTokens(userId) {
    this.users.update(userId, {
      $set: {
        'services.resume.loginTokens': []
      }
    });
  }
  // test hook
  _getUserObserve(connectionId) {
    return this._userObservesForConnections[connectionId];
  }
  // Clean up this connection's association with the token: that is, stop
  // the observe that we started when we associated the connection with
  // this token.
  _removeTokenFromConnection(connectionId) {
    if (hasOwn.call(this._userObservesForConnections, connectionId)) {
      const observe = this._userObservesForConnections[connectionId];
      if (typeof observe === 'number') {
        // We're in the process of setting up an observe for this connection. We
        // can't clean up that observe yet, but if we delete the placeholder for
        // this connection, then the observe will get cleaned up as soon as it has
        // been set up.
        delete this._userObservesForConnections[connectionId];
      } else {
        delete this._userObservesForConnections[connectionId];
        observe.stop();
      }
    }
  }
  _getLoginToken(connectionId) {
    return this._getAccountData(connectionId, 'loginToken');
  }
  // newToken is a hashed token.
  _setLoginToken(userId, connection, newToken) {
    this._removeTokenFromConnection(connection.id);
    this._setAccountData(connection.id, 'loginToken', newToken);
    if (newToken) {
      // Set up an observe for this token. If the token goes away, we need
      // to close the connection.  We defer the observe because there's
      // no need for it to be on the critical path for login; we just need
      // to ensure that the connection will get closed at some point if
      // the token gets deleted.
      //
      // Initially, we set the observe for this connection to a number; this
      // signifies to other code (which might run while we yield) that we are in
      // the process of setting up an observe for this connection. Once the
      // observe is ready to go, we replace the number with the real observe
      // handle (unless the placeholder has been deleted or replaced by a
      // different placehold number, signifying that the connection was closed
      // already -- in this case we just clean up the observe that we started).
      const myObserveNumber = ++this._nextUserObserveNumber;
      this._userObservesForConnections[connection.id] = myObserveNumber;
      Meteor.defer(() => {
        // If something else happened on this connection in the meantime (it got
        // closed, or another call to _setLoginToken happened), just do
        // nothing. We don't need to start an observe for an old connection or old
        // token.
        if (this._userObservesForConnections[connection.id] !== myObserveNumber) {
          return;
        }
        let foundMatchingUser;
        // Because we upgrade unhashed login tokens to hashed tokens at
        // login time, sessions will only be logged in with a hashed
        // token. Thus we only need to observe hashed tokens here.
        const observe = this.users.find({
          _id: userId,
          'services.resume.loginTokens.hashedToken': newToken
        }, {
          fields: {
            _id: 1
          }
        }).observeChanges({
          added: () => {
            foundMatchingUser = true;
          },
          removed: connection.close
          // The onClose callback for the connection takes care of
          // cleaning up the observe handle and any other state we have
          // lying around.
        }, {
          nonMutatingCallbacks: true
        });

        // If the user ran another login or logout command we were waiting for the
        // defer or added to fire (ie, another call to _setLoginToken occurred),
        // then we let the later one win (start an observe, etc) and just stop our
        // observe now.
        //
        // Similarly, if the connection was already closed, then the onClose
        // callback would have called _removeTokenFromConnection and there won't
        // be an entry in _userObservesForConnections. We can stop the observe.
        if (this._userObservesForConnections[connection.id] !== myObserveNumber) {
          observe.stop();
          return;
        }
        this._userObservesForConnections[connection.id] = observe;
        if (!foundMatchingUser) {
          // We've set up an observe on the user associated with `newToken`,
          // so if the new token is removed from the database, we'll close
          // the connection. But the token might have already been deleted
          // before we set up the observe, which wouldn't have closed the
          // connection because the observe wasn't running yet.
          connection.close();
        }
      });
    }
  }
  // (Also used by Meteor Accounts server and tests).
  //
  _generateStampedLoginToken() {
    return {
      token: Random.secret(),
      when: new Date()
    };
  }
  ///
  /// TOKEN EXPIRATION
  ///

  // Deletes expired password reset tokens from the database.
  //
  // Exported for tests. Also, the arguments are only used by
  // tests. oldestValidDate is simulate expiring tokens without waiting
  // for them to actually expire. userId is used by tests to only expire
  // tokens for the test user.
  _expirePasswordResetTokens(oldestValidDate, userId) {
    const tokenLifetimeMs = this._getPasswordResetTokenLifetimeMs();

    // when calling from a test with extra arguments, you must specify both!
    if (oldestValidDate && !userId || !oldestValidDate && userId) {
      throw new Error("Bad test. Must specify both oldestValidDate and userId.");
    }
    oldestValidDate = oldestValidDate || new Date(new Date() - tokenLifetimeMs);
    const tokenFilter = {
      $or: [{
        "services.password.reset.reason": "reset"
      }, {
        "services.password.reset.reason": {
          $exists: false
        }
      }]
    };
    expirePasswordToken(this, oldestValidDate, tokenFilter, userId);
  }

  // Deletes expired password enroll tokens from the database.
  //
  // Exported for tests. Also, the arguments are only used by
  // tests. oldestValidDate is simulate expiring tokens without waiting
  // for them to actually expire. userId is used by tests to only expire
  // tokens for the test user.
  _expirePasswordEnrollTokens(oldestValidDate, userId) {
    const tokenLifetimeMs = this._getPasswordEnrollTokenLifetimeMs();

    // when calling from a test with extra arguments, you must specify both!
    if (oldestValidDate && !userId || !oldestValidDate && userId) {
      throw new Error("Bad test. Must specify both oldestValidDate and userId.");
    }
    oldestValidDate = oldestValidDate || new Date(new Date() - tokenLifetimeMs);
    const tokenFilter = {
      "services.password.enroll.reason": "enroll"
    };
    expirePasswordToken(this, oldestValidDate, tokenFilter, userId);
  }

  // Deletes expired tokens from the database and closes all open connections
  // associated with these tokens.
  //
  // Exported for tests. Also, the arguments are only used by
  // tests. oldestValidDate is simulate expiring tokens without waiting
  // for them to actually expire. userId is used by tests to only expire
  // tokens for the test user.
  _expireTokens(oldestValidDate, userId) {
    const tokenLifetimeMs = this._getTokenLifetimeMs();

    // when calling from a test with extra arguments, you must specify both!
    if (oldestValidDate && !userId || !oldestValidDate && userId) {
      throw new Error("Bad test. Must specify both oldestValidDate and userId.");
    }
    oldestValidDate = oldestValidDate || new Date(new Date() - tokenLifetimeMs);
    const userFilter = userId ? {
      _id: userId
    } : {};

    // Backwards compatible with older versions of meteor that stored login token
    // timestamps as numbers.
    this.users.update(_objectSpread(_objectSpread({}, userFilter), {}, {
      $or: [{
        "services.resume.loginTokens.when": {
          $lt: oldestValidDate
        }
      }, {
        "services.resume.loginTokens.when": {
          $lt: +oldestValidDate
        }
      }]
    }), {
      $pull: {
        "services.resume.loginTokens": {
          $or: [{
            when: {
              $lt: oldestValidDate
            }
          }, {
            when: {
              $lt: +oldestValidDate
            }
          }]
        }
      }
    }, {
      multi: true
    });
    // The observe on Meteor.users will take care of closing connections for
    // expired tokens.
  }

  // @override from accounts_common.js
  config(options) {
    // Call the overridden implementation of the method.
    const superResult = AccountsCommon.prototype.config.apply(this, arguments);

    // If the user set loginExpirationInDays to null, then we need to clear the
    // timer that periodically expires tokens.
    if (hasOwn.call(this._options, 'loginExpirationInDays') && this._options.loginExpirationInDays === null && this.expireTokenInterval) {
      Meteor.clearInterval(this.expireTokenInterval);
      this.expireTokenInterval = null;
    }
    return superResult;
  }
  // Called by accounts-password
  insertUserDoc(options, user) {
    // - clone user document, to protect from modification
    // - add createdAt timestamp
    // - prepare an _id, so that you can modify other collections (eg
    // create a first task for every new user)
    //
    // XXX If the onCreateUser or validateNewUser hooks fail, we might
    // end up having modified some other collection
    // inappropriately. The solution is probably to have onCreateUser
    // accept two callbacks - one that gets called before inserting
    // the user document (in which you can modify its contents), and
    // one that gets called after (in which you should change other
    // collections)
    user = _objectSpread({
      createdAt: new Date(),
      _id: Random.id()
    }, user);
    if (user.services) {
      Object.keys(user.services).forEach(service => pinEncryptedFieldsToUser(user.services[service], user._id));
    }
    let fullUser;
    if (this._onCreateUserHook) {
      fullUser = this._onCreateUserHook(options, user);

      // This is *not* part of the API. We need this because we can't isolate
      // the global server environment between tests, meaning we can't test
      // both having a create user hook set and not having one set.
      if (fullUser === 'TEST DEFAULT HOOK') fullUser = defaultCreateUserHook(options, user);
    } else {
      fullUser = defaultCreateUserHook(options, user);
    }
    this._validateNewUserHooks.forEach(hook => {
      if (!hook(fullUser)) throw new Meteor.Error(403, "User validation failed");
    });
    let userId;
    try {
      userId = this.users.insert(fullUser);
    } catch (e) {
      // XXX string parsing sucks, maybe
      // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
      // https://jira.mongodb.org/browse/SERVER-4637
      if (!e.errmsg) throw e;
      if (e.errmsg.includes('emails.address')) throw new Meteor.Error(403, "Email already exists.");
      if (e.errmsg.includes('username')) throw new Meteor.Error(403, "Username already exists.");
      throw e;
    }
    return userId;
  }
  // Helper function: returns false if email does not match company domain from
  // the configuration.
  _testEmailDomain(email) {
    const domain = this._options.restrictCreationByEmailDomain;
    return !domain || typeof domain === 'function' && domain(email) || typeof domain === 'string' && new RegExp("@".concat(Meteor._escapeRegExp(domain), "$"), 'i').test(email);
  }
  ///
  /// CLEAN UP FOR `logoutOtherClients`
  ///

  _deleteSavedTokensForUser(userId, tokensToDelete) {
    if (tokensToDelete) {
      this.users.update(userId, {
        $unset: {
          "services.resume.haveLoginTokensToDelete": 1,
          "services.resume.loginTokensToDelete": 1
        },
        $pullAll: {
          "services.resume.loginTokens": tokensToDelete
        }
      });
    }
  }
  _deleteSavedTokensForAllUsersOnStartup() {
    // If we find users who have saved tokens to delete on startup, delete
    // them now. It's possible that the server could have crashed and come
    // back up before new tokens are found in localStorage, but this
    // shouldn't happen very often. We shouldn't put a delay here because
    // that would give a lot of power to an attacker with a stolen login
    // token and the ability to crash the server.
    Meteor.startup(() => {
      this.users.find({
        "services.resume.haveLoginTokensToDelete": true
      }, {
        fields: {
          "services.resume.loginTokensToDelete": 1
        }
      }).forEach(user => {
        this._deleteSavedTokensForUser(user._id, user.services.resume.loginTokensToDelete);
      });
    });
  }
  ///
  /// MANAGING USER OBJECTS
  ///

  // Updates or creates a user after we authenticate with a 3rd party.
  //
  // @param serviceName {String} Service name (eg, twitter).
  // @param serviceData {Object} Data to store in the user's record
  //        under services[serviceName]. Must include an "id" field
  //        which is a unique identifier for the user in the service.
  // @param options {Object, optional} Other options to pass to insertUserDoc
  //        (eg, profile)
  // @returns {Object} Object with token and id keys, like the result
  //        of the "login" method.
  //
  updateOrCreateUserFromExternalService(serviceName, serviceData, options) {
    options = _objectSpread({}, options);
    if (serviceName === "password" || serviceName === "resume") {
      throw new Error("Can't use updateOrCreateUserFromExternalService with internal service " + serviceName);
    }
    if (!hasOwn.call(serviceData, 'id')) {
      throw new Error("Service data for service ".concat(serviceName, " must include id"));
    }

    // Look for a user with the appropriate service user id.
    const selector = {};
    const serviceIdKey = "services.".concat(serviceName, ".id");

    // XXX Temporary special case for Twitter. (Issue #629)
    //   The serviceData.id will be a string representation of an integer.
    //   We want it to match either a stored string or int representation.
    //   This is to cater to earlier versions of Meteor storing twitter
    //   user IDs in number form, and recent versions storing them as strings.
    //   This can be removed once migration technology is in place, and twitter
    //   users stored with integer IDs have been migrated to string IDs.
    if (serviceName === "twitter" && !isNaN(serviceData.id)) {
      selector["$or"] = [{}, {}];
      selector["$or"][0][serviceIdKey] = serviceData.id;
      selector["$or"][1][serviceIdKey] = parseInt(serviceData.id, 10);
    } else {
      selector[serviceIdKey] = serviceData.id;
    }
    let user = this.users.findOne(selector, {
      fields: this._options.defaultFieldSelector
    });

    // Check to see if the developer has a custom way to find the user outside
    // of the general selectors above.
    if (!user && this._additionalFindUserOnExternalLogin) {
      user = this._additionalFindUserOnExternalLogin({
        serviceName,
        serviceData,
        options
      });
    }

    // Before continuing, run user hook to see if we should continue
    if (this._beforeExternalLoginHook && !this._beforeExternalLoginHook(serviceName, serviceData, user)) {
      throw new Meteor.Error(403, "Login forbidden");
    }

    // When creating a new user we pass through all options. When updating an
    // existing user, by default we only process/pass through the serviceData
    // (eg, so that we keep an unexpired access token and don't cache old email
    // addresses in serviceData.email). The onExternalLogin hook can be used when
    // creating or updating a user, to modify or pass through more options as
    // needed.
    let opts = user ? {} : options;
    if (this._onExternalLoginHook) {
      opts = this._onExternalLoginHook(options, user);
    }
    if (user) {
      pinEncryptedFieldsToUser(serviceData, user._id);
      let setAttrs = {};
      Object.keys(serviceData).forEach(key => setAttrs["services.".concat(serviceName, ".").concat(key)] = serviceData[key]);

      // XXX Maybe we should re-use the selector above and notice if the update
      //     touches nothing?
      setAttrs = _objectSpread(_objectSpread({}, setAttrs), opts);
      this.users.update(user._id, {
        $set: setAttrs
      });
      return {
        type: serviceName,
        userId: user._id
      };
    } else {
      // Create a new user with the service data.
      user = {
        services: {}
      };
      user.services[serviceName] = serviceData;
      return {
        type: serviceName,
        userId: this.insertUserDoc(opts, user)
      };
    }
  }
  // Removes default rate limiting rule
  removeDefaultRateLimit() {
    const resp = DDPRateLimiter.removeRule(this.defaultRateLimiterRuleId);
    this.defaultRateLimiterRuleId = null;
    return resp;
  }
  // Add a default rule of limiting logins, creating new users and password reset
  // to 5 times every 10 seconds per connection.
  addDefaultRateLimit() {
    if (!this.defaultRateLimiterRuleId) {
      this.defaultRateLimiterRuleId = DDPRateLimiter.addRule({
        userId: null,
        clientAddress: null,
        type: 'method',
        name: name => ['login', 'createUser', 'resetPassword', 'forgotPassword'].includes(name),
        connectionId: connectionId => true
      }, 5, 10000);
    }
  }
  /**
   * @summary Creates options for email sending for reset password and enroll account emails.
   * You can use this function when customizing a reset password or enroll account email sending.
   * @locus Server
   * @param {Object} email Which address of the user's to send the email to.
   * @param {Object} user The user object to generate options for.
   * @param {String} url URL to which user is directed to confirm the email.
   * @param {String} reason `resetPassword` or `enrollAccount`.
   * @returns {Object} Options which can be passed to `Email.send`.
   * @importFromPackage accounts-base
   */
  generateOptionsForEmail(email, user, url, reason) {
    let extra = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : {};
    const options = {
      to: email,
      from: this.emailTemplates[reason].from ? this.emailTemplates[reason].from(user) : this.emailTemplates.from,
      subject: this.emailTemplates[reason].subject(user, url, extra)
    };
    if (typeof this.emailTemplates[reason].text === 'function') {
      options.text = this.emailTemplates[reason].text(user, url, extra);
    }
    if (typeof this.emailTemplates[reason].html === 'function') {
      options.html = this.emailTemplates[reason].html(user, url, extra);
    }
    if (typeof this.emailTemplates.headers === 'object') {
      options.headers = this.emailTemplates.headers;
    }
    return options;
  }
  _checkForCaseInsensitiveDuplicates(fieldName, displayName, fieldValue, ownUserId) {
    // Some tests need the ability to add users with the same case insensitive
    // value, hence the _skipCaseInsensitiveChecksForTest check
    const skipCheck = Object.prototype.hasOwnProperty.call(this._skipCaseInsensitiveChecksForTest, fieldValue);
    if (fieldValue && !skipCheck) {
      const matchedUsers = Meteor.users.find(this._selectorForFastCaseInsensitiveLookup(fieldName, fieldValue), {
        fields: {
          _id: 1
        },
        // we only need a maximum of 2 users for the logic below to work
        limit: 2
      }).fetch();
      if (matchedUsers.length > 0 && (
      // If we don't have a userId yet, any match we find is a duplicate
      !ownUserId ||
      // Otherwise, check to see if there are multiple matches or a match
      // that is not us
      matchedUsers.length > 1 || matchedUsers[0]._id !== ownUserId)) {
        this._handleError("".concat(displayName, " already exists."));
      }
    }
  }
  _createUserCheckingDuplicates(_ref) {
    let {
      user,
      email,
      username,
      options
    } = _ref;
    const newUser = _objectSpread(_objectSpread(_objectSpread({}, user), username ? {
      username
    } : {}), email ? {
      emails: [{
        address: email,
        verified: false
      }]
    } : {});

    // Perform a case insensitive check before insert
    this._checkForCaseInsensitiveDuplicates('username', 'Username', username);
    this._checkForCaseInsensitiveDuplicates('emails.address', 'Email', email);
    const userId = this.insertUserDoc(options, newUser);
    // Perform another check after insert, in case a matching user has been
    // inserted in the meantime
    try {
      this._checkForCaseInsensitiveDuplicates('username', 'Username', username, userId);
      this._checkForCaseInsensitiveDuplicates('emails.address', 'Email', email, userId);
    } catch (ex) {
      // Remove inserted user if the check fails
      Meteor.users.remove(userId);
      throw ex;
    }
    return userId;
  }
}
// Give each login hook callback a fresh cloned copy of the attempt
// object, but don't clone the connection.
//
const cloneAttemptWithConnection = (connection, attempt) => {
  const clonedAttempt = EJSON.clone(attempt);
  clonedAttempt.connection = connection;
  return clonedAttempt;
};
const tryLoginMethod = (type, fn) => Promise.asyncApply(() => {
  let result;
  try {
    result = Promise.await(fn());
  } catch (e) {
    result = {
      error: e
    };
  }
  if (result && !result.type && type) result.type = type;
  return result;
});
const setupDefaultLoginHandlers = accounts => {
  accounts.registerLoginHandler("resume", function (options) {
    return defaultResumeLoginHandler.call(this, accounts, options);
  });
};

// Login handler for resume tokens.
const defaultResumeLoginHandler = (accounts, options) => {
  if (!options.resume) return undefined;
  check(options.resume, String);
  const hashedToken = accounts._hashLoginToken(options.resume);

  // First look for just the new-style hashed login token, to avoid
  // sending the unhashed token to the database in a query if we don't
  // need to.
  let user = accounts.users.findOne({
    "services.resume.loginTokens.hashedToken": hashedToken
  }, {
    fields: {
      "services.resume.loginTokens.$": 1
    }
  });
  if (!user) {
    // If we didn't find the hashed login token, try also looking for
    // the old-style unhashed token.  But we need to look for either
    // the old-style token OR the new-style token, because another
    // client connection logging in simultaneously might have already
    // converted the token.
    user = accounts.users.findOne({
      $or: [{
        "services.resume.loginTokens.hashedToken": hashedToken
      }, {
        "services.resume.loginTokens.token": options.resume
      }]
    },
    // Note: Cannot use ...loginTokens.$ positional operator with $or query.
    {
      fields: {
        "services.resume.loginTokens": 1
      }
    });
  }
  if (!user) return {
    error: new Meteor.Error(403, "You've been logged out by the server. Please log in again.")
  };

  // Find the token, which will either be an object with fields
  // {hashedToken, when} for a hashed token or {token, when} for an
  // unhashed token.
  let oldUnhashedStyleToken;
  let token = user.services.resume.loginTokens.find(token => token.hashedToken === hashedToken);
  if (token) {
    oldUnhashedStyleToken = false;
  } else {
    token = user.services.resume.loginTokens.find(token => token.token === options.resume);
    oldUnhashedStyleToken = true;
  }
  const tokenExpires = accounts._tokenExpiration(token.when);
  if (new Date() >= tokenExpires) return {
    userId: user._id,
    error: new Meteor.Error(403, "Your session has expired. Please log in again.")
  };

  // Update to a hashed token when an unhashed token is encountered.
  if (oldUnhashedStyleToken) {
    // Only add the new hashed token if the old unhashed token still
    // exists (this avoids resurrecting the token if it was deleted
    // after we read it).  Using $addToSet avoids getting an index
    // error if another client logging in simultaneously has already
    // inserted the new hashed token.
    accounts.users.update({
      _id: user._id,
      "services.resume.loginTokens.token": options.resume
    }, {
      $addToSet: {
        "services.resume.loginTokens": {
          "hashedToken": hashedToken,
          "when": token.when
        }
      }
    });

    // Remove the old token *after* adding the new, since otherwise
    // another client trying to login between our removing the old and
    // adding the new wouldn't find a token to login with.
    accounts.users.update(user._id, {
      $pull: {
        "services.resume.loginTokens": {
          "token": options.resume
        }
      }
    });
  }
  return {
    userId: user._id,
    stampedLoginToken: {
      token: options.resume,
      when: token.when
    }
  };
};
const expirePasswordToken = (accounts, oldestValidDate, tokenFilter, userId) => {
  // boolean value used to determine if this method was called from enroll account workflow
  let isEnroll = false;
  const userFilter = userId ? {
    _id: userId
  } : {};
  // check if this method was called from enroll account workflow
  if (tokenFilter['services.password.enroll.reason']) {
    isEnroll = true;
  }
  let resetRangeOr = {
    $or: [{
      "services.password.reset.when": {
        $lt: oldestValidDate
      }
    }, {
      "services.password.reset.when": {
        $lt: +oldestValidDate
      }
    }]
  };
  if (isEnroll) {
    resetRangeOr = {
      $or: [{
        "services.password.enroll.when": {
          $lt: oldestValidDate
        }
      }, {
        "services.password.enroll.when": {
          $lt: +oldestValidDate
        }
      }]
    };
  }
  const expireFilter = {
    $and: [tokenFilter, resetRangeOr]
  };
  if (isEnroll) {
    accounts.users.update(_objectSpread(_objectSpread({}, userFilter), expireFilter), {
      $unset: {
        "services.password.enroll": ""
      }
    }, {
      multi: true
    });
  } else {
    accounts.users.update(_objectSpread(_objectSpread({}, userFilter), expireFilter), {
      $unset: {
        "services.password.reset": ""
      }
    }, {
      multi: true
    });
  }
};
const setExpireTokensInterval = accounts => {
  accounts.expireTokenInterval = Meteor.setInterval(() => {
    accounts._expireTokens();
    accounts._expirePasswordResetTokens();
    accounts._expirePasswordEnrollTokens();
  }, EXPIRE_TOKENS_INTERVAL_MS);
};
const OAuthEncryption = (_Package$oauthEncryp = Package["oauth-encryption"]) === null || _Package$oauthEncryp === void 0 ? void 0 : _Package$oauthEncryp.OAuthEncryption;

// OAuth service data is temporarily stored in the pending credentials
// collection during the oauth authentication process.  Sensitive data
// such as access tokens are encrypted without the user id because
// we don't know the user id yet.  We re-encrypt these fields with the
// user id included when storing the service data permanently in
// the users collection.
//
const pinEncryptedFieldsToUser = (serviceData, userId) => {
  Object.keys(serviceData).forEach(key => {
    let value = serviceData[key];
    if (OAuthEncryption !== null && OAuthEncryption !== void 0 && OAuthEncryption.isSealed(value)) value = OAuthEncryption.seal(OAuthEncryption.open(value), userId);
    serviceData[key] = value;
  });
};

// XXX see comment on Accounts.createUser in passwords_server about adding a
// second "server options" argument.
const defaultCreateUserHook = (options, user) => {
  if (options.profile) user.profile = options.profile;
  return user;
};

// Validate new user's email or Google/Facebook/GitHub account's email
function defaultValidateNewUserHook(user) {
  const domain = this._options.restrictCreationByEmailDomain;
  if (!domain) {
    return true;
  }
  let emailIsGood = false;
  if (user.emails && user.emails.length > 0) {
    emailIsGood = user.emails.reduce((prev, email) => prev || this._testEmailDomain(email.address), false);
  } else if (user.services && Object.values(user.services).length > 0) {
    // Find any email of any service and check it
    emailIsGood = Object.values(user.services).reduce((prev, service) => service.email && this._testEmailDomain(service.email), false);
  }
  if (emailIsGood) {
    return true;
  }
  if (typeof domain === 'string') {
    throw new Meteor.Error(403, "@".concat(domain, " email required"));
  } else {
    throw new Meteor.Error(403, "Email doesn't match the criteria.");
  }
}
const setupUsersCollection = users => {
  ///
  /// RESTRICTING WRITES TO USER OBJECTS
  ///
  users.allow({
    // clients can modify the profile field of their own document, and
    // nothing else.
    update: (userId, user, fields, modifier) => {
      // make sure it is our record
      if (user._id !== userId) {
        return false;
      }

      // user can only modify the 'profile' field. sets to multiple
      // sub-keys (eg profile.foo and profile.bar) are merged into entry
      // in the fields list.
      if (fields.length !== 1 || fields[0] !== 'profile') {
        return false;
      }
      return true;
    },
    fetch: ['_id'] // we only look at _id.
  });

  /// DEFAULT INDEXES ON USERS
  users.createIndex('username', {
    unique: true,
    sparse: true
  });
  users.createIndex('emails.address', {
    unique: true,
    sparse: true
  });
  users.createIndex('services.resume.loginTokens.hashedToken', {
    unique: true,
    sparse: true
  });
  users.createIndex('services.resume.loginTokens.token', {
    unique: true,
    sparse: true
  });
  // For taking care of logoutOtherClients calls that crashed before the
  // tokens were deleted.
  users.createIndex('services.resume.haveLoginTokensToDelete', {
    sparse: true
  });
  // For expiring login tokens
  users.createIndex("services.resume.loginTokens.when", {
    sparse: true
  });
  // For expiring password tokens
  users.createIndex('services.password.reset.when', {
    sparse: true
  });
  users.createIndex('services.password.enroll.when', {
    sparse: true
  });
};

// Generates permutations of all case variations of a given string.
const generateCasePermutationsForString = string => {
  let permutations = [''];
  for (let i = 0; i < string.length; i++) {
    const ch = string.charAt(i);
    permutations = [].concat(...permutations.map(prefix => {
      const lowerCaseChar = ch.toLowerCase();
      const upperCaseChar = ch.toUpperCase();
      // Don't add unnecessary permutations when ch is not a letter
      if (lowerCaseChar === upperCaseChar) {
        return [prefix + ch];
      } else {
        return [prefix + lowerCaseChar, prefix + upperCaseChar];
      }
    }));
  }
  return permutations;
};
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

var exports = require("/node_modules/meteor/accounts-base/server_main.js");

/* Exports */
Package._define("accounts-base", exports, {
  Accounts: Accounts
});

})();

//# sourceURL=meteor://💻app/packages/accounts-base.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYWNjb3VudHMtYmFzZS9zZXJ2ZXJfbWFpbi5qcyIsIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYWNjb3VudHMtYmFzZS9hY2NvdW50c19jb21tb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3BhY2thZ2VzL2FjY291bnRzLWJhc2UvYWNjb3VudHNfc2VydmVyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZTEiLCJleHBvcnQiLCJBY2NvdW50c1NlcnZlciIsImxpbmsiLCJ2IiwiQWNjb3VudHMiLCJNZXRlb3IiLCJzZXJ2ZXIiLCJ1c2VycyIsIl9vYmplY3RTcHJlYWQiLCJtb2R1bGUiLCJkZWZhdWx0IiwiQWNjb3VudHNDb21tb24iLCJFWFBJUkVfVE9LRU5TX0lOVEVSVkFMX01TIiwiVkFMSURfQ09ORklHX0tFWVMiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJfb3B0aW9ucyIsImNvbm5lY3Rpb24iLCJ1bmRlZmluZWQiLCJfaW5pdENvbm5lY3Rpb24iLCJfaW5pdGlhbGl6ZUNvbGxlY3Rpb24iLCJfb25Mb2dpbkhvb2siLCJIb29rIiwiYmluZEVudmlyb25tZW50IiwiZGVidWdQcmludEV4Y2VwdGlvbnMiLCJfb25Mb2dpbkZhaWx1cmVIb29rIiwiX29uTG9nb3V0SG9vayIsIkRFRkFVTFRfTE9HSU5fRVhQSVJBVElPTl9EQVlTIiwiTE9HSU5fVU5FWFBJUklOR19UT0tFTl9EQVlTIiwibGNlTmFtZSIsIkxvZ2luQ2FuY2VsbGVkRXJyb3IiLCJtYWtlRXJyb3JUeXBlIiwiZGVzY3JpcHRpb24iLCJtZXNzYWdlIiwicHJvdG90eXBlIiwibmFtZSIsIm51bWVyaWNFcnJvciIsImNvbGxlY3Rpb24iLCJNb25nbyIsIkNvbGxlY3Rpb24iLCJFcnJvciIsImNvbGxlY3Rpb25OYW1lIiwiX3ByZXZlbnRBdXRvcHVibGlzaCIsInVzZXJJZCIsIl9hZGREZWZhdWx0RmllbGRTZWxlY3RvciIsImRlZmF1bHRGaWVsZFNlbGVjdG9yIiwiZmllbGRzIiwia2V5cyIsIk9iamVjdCIsImxlbmd0aCIsImtleXMyIiwidXNlciIsImZpbmRPbmUiLCJ1c2VyQXN5bmMiLCJmaW5kT25lQXN5bmMiLCJjb25maWciLCJpc1NlcnZlciIsIl9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18iLCJhY2NvdW50c0NvbmZpZ0NhbGxlZCIsIl9kZWJ1ZyIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImlzQ2xpZW50IiwiUGFja2FnZSIsIk9BdXRoRW5jcnlwdGlvbiIsImxvYWRLZXkiLCJvYXV0aFNlY3JldEtleSIsImZvckVhY2giLCJrZXkiLCJpbmNsdWRlcyIsIl9uYW1lIiwib25Mb2dpbiIsImZ1bmMiLCJyZXQiLCJyZWdpc3RlciIsIl9zdGFydHVwQ2FsbGJhY2siLCJjYWxsYmFjayIsIm9uTG9naW5GYWlsdXJlIiwib25Mb2dvdXQiLCJkZHBVcmwiLCJERFAiLCJjb25uZWN0IiwiQUNDT1VOVFNfQ09OTkVDVElPTl9VUkwiLCJfZ2V0VG9rZW5MaWZldGltZU1zIiwibG9naW5FeHBpcmF0aW9uSW5EYXlzIiwibG9naW5FeHBpcmF0aW9uIiwiX2dldFBhc3N3b3JkUmVzZXRUb2tlbkxpZmV0aW1lTXMiLCJwYXNzd29yZFJlc2V0VG9rZW5FeHBpcmF0aW9uIiwicGFzc3dvcmRSZXNldFRva2VuRXhwaXJhdGlvbkluRGF5cyIsIkRFRkFVTFRfUEFTU1dPUkRfUkVTRVRfVE9LRU5fRVhQSVJBVElPTl9EQVlTIiwiX2dldFBhc3N3b3JkRW5yb2xsVG9rZW5MaWZldGltZU1zIiwicGFzc3dvcmRFbnJvbGxUb2tlbkV4cGlyYXRpb24iLCJwYXNzd29yZEVucm9sbFRva2VuRXhwaXJhdGlvbkluRGF5cyIsIkRFRkFVTFRfUEFTU1dPUkRfRU5ST0xMX1RPS0VOX0VYUElSQVRJT05fREFZUyIsIl90b2tlbkV4cGlyYXRpb24iLCJ3aGVuIiwiRGF0ZSIsImdldFRpbWUiLCJfdG9rZW5FeHBpcmVzU29vbiIsIm1pbkxpZmV0aW1lTXMiLCJtaW5MaWZldGltZUNhcE1zIiwiTUlOX1RPS0VOX0xJRkVUSU1FX0NBUF9TRUNTIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzIiwiY3J5cHRvIiwiVVJMIiwiaGFzT3duIiwiTm9uRW1wdHlTdHJpbmciLCJNYXRjaCIsIldoZXJlIiwieCIsImNoZWNrIiwiU3RyaW5nIiwib25DcmVhdGVMb2dpblRva2VuIiwiX29uQ3JlYXRlTG9naW5Ub2tlbkhvb2siLCJfc2VsZWN0b3JGb3JGYXN0Q2FzZUluc2Vuc2l0aXZlTG9va3VwIiwiZmllbGROYW1lIiwic3RyaW5nIiwicHJlZml4Iiwic3Vic3RyaW5nIiwiTWF0aCIsIm1pbiIsIm9yQ2xhdXNlIiwiZ2VuZXJhdGVDYXNlUGVybXV0YXRpb25zRm9yU3RyaW5nIiwibWFwIiwicHJlZml4UGVybXV0YXRpb24iLCJzZWxlY3RvciIsIlJlZ0V4cCIsIl9lc2NhcGVSZWdFeHAiLCJjYXNlSW5zZW5zaXRpdmVDbGF1c2UiLCIkYW5kIiwiJG9yIiwiX2ZpbmRVc2VyQnlRdWVyeSIsInF1ZXJ5IiwiaWQiLCJmaWVsZFZhbHVlIiwidXNlcm5hbWUiLCJlbWFpbCIsImNhbmRpZGF0ZVVzZXJzIiwiZmluZCIsImxpbWl0IiwiZmV0Y2giLCJfaGFuZGxlRXJyb3IiLCJtc2ciLCJ0aHJvd0Vycm9yIiwiZXJyb3JDb2RlIiwiZXJyb3IiLCJhbWJpZ3VvdXNFcnJvck1lc3NhZ2VzIiwiX3VzZXJRdWVyeVZhbGlkYXRvciIsIk9wdGlvbmFsIiwiX3NlcnZlciIsIl9pbml0U2VydmVyTWV0aG9kcyIsIl9pbml0QWNjb3VudERhdGFIb29rcyIsIl9hdXRvcHVibGlzaEZpZWxkcyIsImxvZ2dlZEluVXNlciIsIm90aGVyVXNlcnMiLCJfZGVmYXVsdFB1Ymxpc2hGaWVsZHMiLCJwcm9qZWN0aW9uIiwicHJvZmlsZSIsImVtYWlscyIsIl9pbml0U2VydmVyUHVibGljYXRpb25zIiwiX2FjY291bnREYXRhIiwiX3VzZXJPYnNlcnZlc0ZvckNvbm5lY3Rpb25zIiwiX25leHRVc2VyT2JzZXJ2ZU51bWJlciIsIl9sb2dpbkhhbmRsZXJzIiwic2V0dXBVc2Vyc0NvbGxlY3Rpb24iLCJzZXR1cERlZmF1bHRMb2dpbkhhbmRsZXJzIiwic2V0RXhwaXJlVG9rZW5zSW50ZXJ2YWwiLCJfdmFsaWRhdGVMb2dpbkhvb2siLCJfdmFsaWRhdGVOZXdVc2VySG9va3MiLCJkZWZhdWx0VmFsaWRhdGVOZXdVc2VySG9vayIsImJpbmQiLCJfZGVsZXRlU2F2ZWRUb2tlbnNGb3JBbGxVc2Vyc09uU3RhcnR1cCIsIl9za2lwQ2FzZUluc2Vuc2l0aXZlQ2hlY2tzRm9yVGVzdCIsInVybHMiLCJyZXNldFBhc3N3b3JkIiwidG9rZW4iLCJleHRyYVBhcmFtcyIsImJ1aWxkRW1haWxVcmwiLCJ2ZXJpZnlFbWFpbCIsImxvZ2luVG9rZW4iLCJlbnJvbGxBY2NvdW50IiwiYWRkRGVmYXVsdFJhdGVMaW1pdCIsInBhdGgiLCJ1cmwiLCJhYnNvbHV0ZVVybCIsInBhcmFtcyIsImVudHJpZXMiLCJ2YWx1ZSIsInNlYXJjaFBhcmFtcyIsImFwcGVuZCIsInRvU3RyaW5nIiwiY3VycmVudEludm9jYXRpb24iLCJfQ3VycmVudE1ldGhvZEludm9jYXRpb24iLCJnZXQiLCJfQ3VycmVudFB1YmxpY2F0aW9uSW52b2NhdGlvbiIsInZhbGlkYXRlTG9naW5BdHRlbXB0IiwidmFsaWRhdGVOZXdVc2VyIiwicHVzaCIsImJlZm9yZUV4dGVybmFsTG9naW4iLCJfYmVmb3JlRXh0ZXJuYWxMb2dpbkhvb2siLCJvbkNyZWF0ZVVzZXIiLCJfb25DcmVhdGVVc2VySG9vayIsIndyYXBGbiIsIm9uRXh0ZXJuYWxMb2dpbiIsIl9vbkV4dGVybmFsTG9naW5Ib29rIiwic2V0QWRkaXRpb25hbEZpbmRVc2VyT25FeHRlcm5hbExvZ2luIiwiX2FkZGl0aW9uYWxGaW5kVXNlck9uRXh0ZXJuYWxMb2dpbiIsIl92YWxpZGF0ZUxvZ2luIiwiYXR0ZW1wdCIsImNsb25lQXR0ZW1wdFdpdGhDb25uZWN0aW9uIiwiZSIsImFsbG93ZWQiLCJfc3VjY2Vzc2Z1bExvZ2luIiwiZWFjaCIsIl9mYWlsZWRMb2dpbiIsIl9zdWNjZXNzZnVsTG9nb3V0IiwiX2xvZ2luVXNlciIsIm1ldGhvZEludm9jYXRpb24iLCJzdGFtcGVkTG9naW5Ub2tlbiIsIl9nZW5lcmF0ZVN0YW1wZWRMb2dpblRva2VuIiwiX2luc2VydExvZ2luVG9rZW4iLCJfbm9ZaWVsZHNBbGxvd2VkIiwiX3NldExvZ2luVG9rZW4iLCJfaGFzaExvZ2luVG9rZW4iLCJzZXRVc2VySWQiLCJ0b2tlbkV4cGlyZXMiLCJfYXR0ZW1wdExvZ2luIiwibWV0aG9kTmFtZSIsIm1ldGhvZEFyZ3MiLCJyZXN1bHQiLCJ0eXBlIiwibWV0aG9kQXJndW1lbnRzIiwiQXJyYXkiLCJmcm9tIiwiX2xvZ2luTWV0aG9kIiwiZm4iLCJ0cnlMb2dpbk1ldGhvZCIsIl9yZXBvcnRMb2dpbkZhaWx1cmUiLCJyZWdpc3RlckxvZ2luSGFuZGxlciIsImhhbmRsZXIiLCJfcnVuTG9naW5IYW5kbGVycyIsImRlc3Ryb3lUb2tlbiIsInVwZGF0ZSIsIiRwdWxsIiwiaGFzaGVkVG9rZW4iLCJhY2NvdW50cyIsIm1ldGhvZHMiLCJsb2dpbiIsImFyZ3VtZW50cyIsImxvZ291dCIsIl9nZXRMb2dpblRva2VuIiwiZ2V0TmV3VG9rZW4iLCJjdXJyZW50SGFzaGVkVG9rZW4iLCJjdXJyZW50U3RhbXBlZFRva2VuIiwic2VydmljZXMiLCJyZXN1bWUiLCJsb2dpblRva2VucyIsInN0YW1wZWRUb2tlbiIsIm5ld1N0YW1wZWRUb2tlbiIsInJlbW92ZU90aGVyVG9rZW5zIiwiY3VycmVudFRva2VuIiwiJG5lIiwiY29uZmlndXJlTG9naW5TZXJ2aWNlIiwiT2JqZWN0SW5jbHVkaW5nIiwic2VydmljZSIsIm9hdXRoIiwic2VydmljZU5hbWVzIiwiU2VydmljZUNvbmZpZ3VyYXRpb24iLCJjb25maWd1cmF0aW9ucyIsImtleUlzTG9hZGVkIiwic2VjcmV0Iiwic2VhbCIsImluc2VydCIsIm9uQ29ubmVjdGlvbiIsIm9uQ2xvc2UiLCJfcmVtb3ZlVG9rZW5Gcm9tQ29ubmVjdGlvbiIsInB1Ymxpc2giLCJyZWFkeSIsImlzX2F1dG8iLCJzdGFydHVwIiwiY3VzdG9tRmllbGRzIiwiX2lkIiwiYXV0b3B1Ymxpc2giLCJ0b0ZpZWxkU2VsZWN0b3IiLCJyZWR1Y2UiLCJwcmV2IiwiZmllbGQiLCJhZGRBdXRvcHVibGlzaEZpZWxkcyIsIm9wdHMiLCJhcHBseSIsImZvckxvZ2dlZEluVXNlciIsImZvck90aGVyVXNlcnMiLCJzZXREZWZhdWx0UHVibGlzaEZpZWxkcyIsIl9nZXRBY2NvdW50RGF0YSIsImNvbm5lY3Rpb25JZCIsImRhdGEiLCJfc2V0QWNjb3VudERhdGEiLCJoYXNoIiwiY3JlYXRlSGFzaCIsImRpZ2VzdCIsIl9oYXNoU3RhbXBlZFRva2VuIiwiaGFzaGVkU3RhbXBlZFRva2VuIiwiX2luc2VydEhhc2hlZExvZ2luVG9rZW4iLCIkYWRkVG9TZXQiLCJfY2xlYXJBbGxMb2dpblRva2VucyIsIiRzZXQiLCJfZ2V0VXNlck9ic2VydmUiLCJvYnNlcnZlIiwic3RvcCIsIm5ld1Rva2VuIiwibXlPYnNlcnZlTnVtYmVyIiwiZGVmZXIiLCJmb3VuZE1hdGNoaW5nVXNlciIsIm9ic2VydmVDaGFuZ2VzIiwiYWRkZWQiLCJyZW1vdmVkIiwiY2xvc2UiLCJub25NdXRhdGluZ0NhbGxiYWNrcyIsIlJhbmRvbSIsIl9leHBpcmVQYXNzd29yZFJlc2V0VG9rZW5zIiwib2xkZXN0VmFsaWREYXRlIiwidG9rZW5MaWZldGltZU1zIiwidG9rZW5GaWx0ZXIiLCIkZXhpc3RzIiwiZXhwaXJlUGFzc3dvcmRUb2tlbiIsIl9leHBpcmVQYXNzd29yZEVucm9sbFRva2VucyIsIl9leHBpcmVUb2tlbnMiLCJ1c2VyRmlsdGVyIiwiJGx0IiwibXVsdGkiLCJzdXBlclJlc3VsdCIsImV4cGlyZVRva2VuSW50ZXJ2YWwiLCJjbGVhckludGVydmFsIiwiaW5zZXJ0VXNlckRvYyIsImNyZWF0ZWRBdCIsInBpbkVuY3J5cHRlZEZpZWxkc1RvVXNlciIsImZ1bGxVc2VyIiwiZGVmYXVsdENyZWF0ZVVzZXJIb29rIiwiaG9vayIsImVycm1zZyIsIl90ZXN0RW1haWxEb21haW4iLCJkb21haW4iLCJyZXN0cmljdENyZWF0aW9uQnlFbWFpbERvbWFpbiIsInRlc3QiLCJfZGVsZXRlU2F2ZWRUb2tlbnNGb3JVc2VyIiwidG9rZW5zVG9EZWxldGUiLCIkdW5zZXQiLCIkcHVsbEFsbCIsImxvZ2luVG9rZW5zVG9EZWxldGUiLCJ1cGRhdGVPckNyZWF0ZVVzZXJGcm9tRXh0ZXJuYWxTZXJ2aWNlIiwic2VydmljZU5hbWUiLCJzZXJ2aWNlRGF0YSIsInNlcnZpY2VJZEtleSIsImlzTmFOIiwicGFyc2VJbnQiLCJzZXRBdHRycyIsInJlbW92ZURlZmF1bHRSYXRlTGltaXQiLCJyZXNwIiwiRERQUmF0ZUxpbWl0ZXIiLCJyZW1vdmVSdWxlIiwiZGVmYXVsdFJhdGVMaW1pdGVyUnVsZUlkIiwiYWRkUnVsZSIsImNsaWVudEFkZHJlc3MiLCJnZW5lcmF0ZU9wdGlvbnNGb3JFbWFpbCIsInJlYXNvbiIsImV4dHJhIiwidG8iLCJlbWFpbFRlbXBsYXRlcyIsInN1YmplY3QiLCJ0ZXh0IiwiaHRtbCIsImhlYWRlcnMiLCJfY2hlY2tGb3JDYXNlSW5zZW5zaXRpdmVEdXBsaWNhdGVzIiwiZGlzcGxheU5hbWUiLCJvd25Vc2VySWQiLCJza2lwQ2hlY2siLCJtYXRjaGVkVXNlcnMiLCJfY3JlYXRlVXNlckNoZWNraW5nRHVwbGljYXRlcyIsIm5ld1VzZXIiLCJhZGRyZXNzIiwidmVyaWZpZWQiLCJleCIsInJlbW92ZSIsImNsb25lZEF0dGVtcHQiLCJFSlNPTiIsImNsb25lIiwiZGVmYXVsdFJlc3VtZUxvZ2luSGFuZGxlciIsIm9sZFVuaGFzaGVkU3R5bGVUb2tlbiIsImlzRW5yb2xsIiwicmVzZXRSYW5nZU9yIiwiZXhwaXJlRmlsdGVyIiwic2V0SW50ZXJ2YWwiLCJpc1NlYWxlZCIsIm9wZW4iLCJlbWFpbElzR29vZCIsInZhbHVlcyIsImFsbG93IiwibW9kaWZpZXIiLCJjcmVhdGVJbmRleCIsInVuaXF1ZSIsInNwYXJzZSIsInBlcm11dGF0aW9ucyIsImkiLCJjaCIsImNoYXJBdCIsImNvbmNhdCIsImxvd2VyQ2FzZUNoYXIiLCJ0b0xvd2VyQ2FzZSIsInVwcGVyQ2FzZUNoYXIiLCJ0b1VwcGVyQ2FzZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQUFBQSxPQUFPLENBQUNDLE1BQU0sQ0FBQztJQUFDQyxjQUFjLEVBQUMsTUFBSUE7RUFBYyxDQUFDLENBQUM7RUFBQyxJQUFJQSxjQUFjO0VBQUNGLE9BQU8sQ0FBQ0csSUFBSSxDQUFDLHNCQUFzQixFQUFDO0lBQUNELGNBQWMsQ0FBQ0UsQ0FBQyxFQUFDO01BQUNGLGNBQWMsR0FBQ0UsQ0FBQztJQUFBO0VBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztFQUVuSjtBQUNBO0FBQ0E7QUFDQTtFQUNBQyxRQUFRLEdBQUcsSUFBSUgsY0FBYyxDQUFDSSxNQUFNLENBQUNDLE1BQU0sQ0FBQzs7RUFFNUM7RUFDQTtFQUNBOztFQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNBRCxNQUFNLENBQUNFLEtBQUssR0FBR0gsUUFBUSxDQUFDRyxLQUFLO0FBQUMscUI7Ozs7Ozs7Ozs7O0FDbEI5QixJQUFJQyxhQUFhO0FBQUNDLE1BQU0sQ0FBQ1AsSUFBSSxDQUFDLHNDQUFzQyxFQUFDO0VBQUNRLE9BQU8sQ0FBQ1AsQ0FBQyxFQUFDO0lBQUNLLGFBQWEsR0FBQ0wsQ0FBQztFQUFBO0FBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztBQUFyR00sTUFBTSxDQUFDVCxNQUFNLENBQUM7RUFBQ1csY0FBYyxFQUFDLE1BQUlBLGNBQWM7RUFBQ0MseUJBQXlCLEVBQUMsTUFBSUE7QUFBeUIsQ0FBQyxDQUFDO0FBQUMsSUFBSVAsTUFBTTtBQUFDSSxNQUFNLENBQUNQLElBQUksQ0FBQyxlQUFlLEVBQUM7RUFBQ0csTUFBTSxDQUFDRixDQUFDLEVBQUM7SUFBQ0UsTUFBTSxHQUFDRixDQUFDO0VBQUE7QUFBQyxDQUFDLEVBQUMsQ0FB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O0FBR0Q7QUFDQSxNQUFNdFIsaUNBQWlDLEdBQUdOLE1BQU0sSUFBSTtFQUNsRCxJQUFJNlIsWUFBWSxHQUFHLENBQUMsRUFBRSxDQUFDO0VBQ3ZCLEtBQUssSUFBSUMsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHOVIsTUFBTSxDQUFDbkUsTUFBTSxFQUFFaVcsQ0FBQyxFQUFFLEVBQUU7SUFDdEMsTUFBTUMsRUFBRSxHQUFHL1IsTUFBTSxDQUFDZ1MsTUFBTSxDQUFDRixDQUFDLENBQUM7SUFDM0JELFlBQVksR0FBRyxFQUFFLENBQUNJLE1BQU0sQ0FBQyxHQUFJSixZQUFZLENBQUN0UixHQUFHLENBQUNOLE1BQU0sSUFBSTtNQUN0RCxNQUFNaVMsYUFBYSxHQUFHSCxFQUFFLENBQUNJLFdBQVcsRUFBRTtNQUN0QyxNQUFNQyxhQUFhLEdBQUdMLEVBQUUsQ0FBQ00sV0FBVyxFQUFFO01BQ3RDO01BQ0EsSUFBSUgsYUFBYSxLQUFLRSxhQUFhLEVBQUU7UUFDbkMsT0FBTyxDQUFDblMsTUFBTSxHQUFHOFIsRUFBRSxDQUFDO01BQ3RCLENBQUMsTUFBTTtRQUNMLE9BQU8sQ0FBQzlSLE1BQU0sR0FBR2lTLGFBQWEsRUFBRWpTLE1BQU0sR0FBR21TLGFBQWEsQ0FBQztNQUN6RDtJQUNGLENBQUMsQ0FBRSxDQUFDO0VBQ047RUFDQSxPQUFPUCxZQUFZO0FBQ3JCLENBQUMsQyIsImZpbGUiOiIvcGFja2FnZXMvYWNjb3VudHMtYmFzZS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFjY291bnRzU2VydmVyIH0gZnJvbSBcIi4vYWNjb3VudHNfc2VydmVyLmpzXCI7XG5cbi8qKlxuICogQG5hbWVzcGFjZSBBY2NvdW50c1xuICogQHN1bW1hcnkgVGhlIG5hbWVzcGFjZSBmb3IgYWxsIHNlcnZlci1zaWRlIGFjY291bnRzLXJlbGF0ZWQgbWV0aG9kcy5cbiAqL1xuQWNjb3VudHMgPSBuZXcgQWNjb3VudHNTZXJ2ZXIoTWV0ZW9yLnNlcnZlcik7XG5cbi8vIFVzZXJzIHRhYmxlLiBEb24ndCB1c2UgdGhlIG5vcm1hbCBhdXRvcHVibGlzaCwgc2luY2Ugd2Ugd2FudCB0byBoaWRlXG4vLyBzb21lIGZpZWxkcy4gQ29kZSB0byBhdXRvcHVibGlzaCB0aGlzIGlzIGluIGFjY291bnRzX3NlcnZlci5qcy5cbi8vIFhYWCBBbGxvdyB1c2VycyB0byBjb25maWd1cmUgdGhpcyBjb2xsZWN0aW9uIG5hbWUuXG5cbi8qKlxuICogQHN1bW1hcnkgQSBbTW9uZ28uQ29sbGVjdGlvbl0oI2NvbGxlY3Rpb25zKSBjb250YWluaW5nIHVzZXIgZG9jdW1lbnRzLlxuICogQGxvY3VzIEFueXdoZXJlXG4gKiBAdHlwZSB7TW9uZ28uQ29sbGVjdGlvbn1cbiAqIEBpbXBvcnRGcm9tUGFja2FnZSBtZXRlb3JcbiovXG5NZXRlb3IudXNlcnMgPSBBY2NvdW50cy51c2VycztcblxuZXhwb3J0IHtcbiAgLy8gU2luY2UgdGhpcyBmaWxlIGlzIHRoZSBtYWluIG1vZHVsZSBmb3IgdGhlIHNlcnZlciB2ZXJzaW9uIG9mIHRoZVxuICAvLyBhY2NvdW50cy1iYXNlIHBhY2thZ2UsIHByb3BlcnRpZXMgb2Ygbm9uLWVudHJ5LXBvaW50IG1vZHVsZXMgbmVlZCB0b1xuICAvLyBiZSByZS1leHBvcnRlZCBpbiBvcmRlciB0byBiZSBhY2Nlc3NpYmxlIHRvIG1vZHVsZXMgdGhhdCBpbXBvcnQgdGhlXG4gIC8vIGFjY291bnRzLWJhc2UgcGFja2FnZS5cbiAgQWNjb3VudHNTZXJ2ZXJcbn07XG4iLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcblxuLy8gY29uZmlnIG9wdGlvbiBrZXlzXG5jb25zdCBWQUxJRF9DT05GSUdfS0VZUyA9IFtcbiAgJ3NlbmRWZXJpZmljYXRpb25FbWFpbCcsXG4gICdmb3JiaWRDbGllbnRBY2NvdW50Q3JlYXRpb24nLFxuICAncGFzc3dvcmRFbnJvbGxUb2tlbkV4cGlyYXRpb24nLFxuICAncGFzc3dvcmRFbnJvbGxUb2tlbkV4cGlyYXRpb25JbkRheXMnLFxuICAncmVzdHJpY3RDcmVhdGlvbkJ5RW1haWxEb21haW4nLFxuICAnbG9naW5FeHBpcmF0aW9uSW5EYXlzJyxcbiAgJ2xvZ2luRXhwaXJhdGlvbicsXG4gICdwYXNzd29yZFJlc2V0VG9rZW5FeHBpcmF0aW9uSW5EYXlzJyxcbiAgJ3Bhc3N3b3JkUmVzZXRUb2tlbkV4cGlyYXRpb24nLFxuICAnYW1iaWd1b3VzRXJyb3JNZXNzYWdlcycsXG4gICdiY3J5cHRSb3VuZHMnLFxuICAnZGVmYXVsdEZpZWxkU2VsZWN0b3InLFxuICAnbG9naW5Ub2tlbkV4cGlyYXRpb25Ib3VycycsXG4gICd0b2tlblNlcXVlbmNlTGVuZ3RoJyxcbiAgJ2NvbGxlY3Rpb24nLFxuXTtcblxuLyoqXG4gKiBAc3VtbWFyeSBTdXBlci1jb25zdHJ1Y3RvciBmb3IgQWNjb3VudHNDbGllbnQgYW5kIEFjY291bnRzU2VydmVyLlxuICogQGxvY3VzIEFueXdoZXJlXG4gKiBAY2xhc3MgQWNjb3VudHNDb21tb25cbiAqIEBpbnN0YW5jZW5hbWUgYWNjb3VudHNDbGllbnRPclNlcnZlclxuICogQHBhcmFtIG9wdGlvbnMge09iamVjdH0gYW4gb2JqZWN0IHdpdGggZmllbGRzOlxuICogLSBjb25uZWN0aW9uIHtPYmplY3R9IE9wdGlvbmFsIEREUCBjb25uZWN0aW9uIHRvIHJldXNlLlxuICogLSBkZHBVcmwge1N0cmluZ30gT3B0aW9uYWwgVVJMIGZvciBjcmVhdGluZyBhIG5ldyBERFAgY29ubmVjdGlvbi5cbiAqIC0gY29sbGVjdGlvbiB7U3RyaW5nfE1vbmdvLkNvbGxlY3Rpb259IFRoZSBuYW1lIG9mIHRoZSBNb25nby5Db2xsZWN0aW9uXG4gKiAgICAgb3IgdGhlIE1vbmdvLkNvbGxlY3Rpb24gb2JqZWN0IHRvIGhvbGQgdGhlIHVzZXJzLlxuICovXG5leHBvcnQgY2xhc3MgQWNjb3VudHNDb21tb24ge1xuICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG4gICAgLy8gQ3VycmVudGx5IHRoaXMgaXMgcmVhZCBkaXJlY3RseSBieSBwYWNrYWdlcyBsaWtlIGFjY291bnRzLXBhc3N3b3JkXG4gICAgLy8gYW5kIGFjY291bnRzLXVpLXVuc3R5bGVkLlxuICAgIHRoaXMuX29wdGlvbnMgPSB7fTtcblxuICAgIC8vIE5vdGUgdGhhdCBzZXR0aW5nIHRoaXMuY29ubmVjdGlvbiA9IG51bGwgY2F1c2VzIHRoaXMudXNlcnMgdG8gYmUgYVxuICAgIC8vIExvY2FsQ29sbGVjdGlvbiwgd2hpY2ggaXMgbm90IHdoYXQgd2Ugd2FudC5cbiAgICB0aGlzLmNvbm5lY3Rpb24gPSB1bmRlZmluZWQ7XG4gICAgdGhpcy5faW5pdENvbm5lY3Rpb24ob3B0aW9ucyB8fCB7fSk7XG5cbiAgICAvLyBUaGVyZSBpcyBhbiBhbGxvdyBjYWxsIGluIGFjY291bnRzX3NlcnZlci5qcyB0aGF0IHJlc3RyaWN0cyB3cml0ZXMgdG9cbiAgICAvLyB0aGlzIGNvbGxlY3Rpb24uXG4gICAgdGhpcy51c2VycyA9IHRoaXMuX2luaXRpYWxpemVDb2xsZWN0aW9uKG9wdGlvbnMgfHwge30pO1xuXG4gICAgLy8gQ2FsbGJhY2sgZXhjZXB0aW9ucyBhcmUgcHJpbnRlZCB3aXRoIE1ldGVvci5fZGVidWcgYW5kIGlnbm9yZWQuXG4gICAgdGhpcy5fb25Mb2dpbkhvb2sgPSBuZXcgSG9vayh7XG4gICAgICBiaW5kRW52aXJvbm1lbnQ6IGZhbHNlLFxuICAgICAgZGVidWdQcmludEV4Y2VwdGlvbnM6ICdvbkxvZ2luIGNhbGxiYWNrJyxcbiAgICB9KTtcblxuICAgIHRoaXMuX29uTG9naW5GYWlsdXJlSG9vayA9IG5ldyBIb29rKHtcbiAgICAgIGJpbmRFbnZpcm9ubWVudDogZmFsc2UsXG4gICAgICBkZWJ1Z1ByaW50RXhjZXB0aW9uczogJ29uTG9naW5GYWlsdXJlIGNhbGxiYWNrJyxcbiAgICB9KTtcblxuICAgIHRoaXMuX29uTG9nb3V0SG9vayA9IG5ldyBIb29rKHtcbiAgICAgIGJpbmRFbnZpcm9ubWVudDogZmFsc2UsXG4gICAgICBkZWJ1Z1ByaW50RXhjZXB0aW9uczogJ29uTG9nb3V0IGNhbGxiYWNrJyxcbiAgICB9KTtcblxuICAgIC8vIEV4cG9zZSBmb3IgdGVzdGluZy5cbiAgICB0aGlzLkRFRkFVTFRfTE9HSU5fRVhQSVJBVElPTl9EQVlTID0gREVGQVVMVF9MT0dJTl9FWFBJUkFUSU9OX0RBWVM7XG4gICAgdGhpcy5MT0dJTl9VTkVYUElSSU5HX1RPS0VOX0RBWVMgPSBMT0dJTl9VTkVYUElSSU5HX1RPS0VOX0RBWVM7XG5cbiAgICAvLyBUaHJvd24gd2hlbiB0aGUgdXNlciBjYW5jZWxzIHRoZSBsb2dpbiBwcm9jZXNzIChlZywgY2xvc2VzIGFuIG9hdXRoXG4gICAgLy8gcG9wdXAsIGRlY2xpbmVzIHJldGluYSBzY2FuLCBldGMpXG4gICAgY29uc3QgbGNlTmFtZSA9ICdBY2NvdW50cy5Mb2dpbkNhbmNlbGxlZEVycm9yJztcbiAgICB0aGlzLkxvZ2luQ2FuY2VsbGVkRXJyb3IgPSBNZXRlb3IubWFrZUVycm9yVHlwZShsY2VOYW1lLCBmdW5jdGlvbihcbiAgICAgIGRlc2NyaXB0aW9uXG4gICAgKSB7XG4gICAgICB0aGlzLm1lc3NhZ2UgPSBkZXNjcmlwdGlvbjtcbiAgICB9KTtcbiAgICB0aGlzLkxvZ2luQ2FuY2VsbGVkRXJyb3IucHJvdG90eXBlLm5hbWUgPSBsY2VOYW1lO1xuXG4gICAgLy8gVGhpcyBpcyB1c2VkIHRvIHRyYW5zbWl0IHNwZWNpZmljIHN1YmNsYXNzIGVycm9ycyBvdmVyIHRoZSB3aXJlLiBXZVxuICAgIC8vIHNob3VsZCBjb21lIHVwIHdpdGggYSBtb3JlIGdlbmVyaWMgd2F5IHRvIGRvIHRoaXMgKGVnLCB3aXRoIHNvbWUgc29ydCBvZlxuICAgIC8vIHN5bWJvbGljIGVycm9yIGNvZGUgcmF0aGVyIHRoYW4gYSBudW1iZXIpLlxuICAgIHRoaXMuTG9naW5DYW5jZWxsZWRFcnJvci5udW1lcmljRXJyb3IgPSAweDhhY2RjMmY7XG4gIH1cblxuICBfaW5pdGlhbGl6ZUNvbGxlY3Rpb24ob3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLmNvbGxlY3Rpb24gJiYgdHlwZW9mIG9wdGlvbnMuY29sbGVjdGlvbiAhPT0gJ3N0cmluZycgJiYgIShvcHRpb25zLmNvbGxlY3Rpb24gaW5zdGFuY2VvZiBNb25nby5Db2xsZWN0aW9uKSkge1xuICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignQ29sbGVjdGlvbiBwYXJhbWV0ZXIgY2FuIGJlIG9ubHkgb2YgdHlwZSBzdHJpbmcgb3IgXCJNb25nby5Db2xsZWN0aW9uXCInKTtcbiAgICB9XG5cbiAgICBsZXQgY29sbGVjdGlvbk5hbWUgPSAndXNlcnMnO1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5jb2xsZWN0aW9uID09PSAnc3RyaW5nJykge1xuICAgICAgY29sbGVjdGlvbk5hbWUgPSBvcHRpb25zLmNvbGxlY3Rpb247XG4gICAgfVxuXG4gICAgbGV0IGNvbGxlY3Rpb247XG4gICAgaWYgKG9wdGlvbnMuY29sbGVjdGlvbiBpbnN0YW5jZW9mIE1vbmdvLkNvbGxlY3Rpb24pIHtcbiAgICAgIGNvbGxlY3Rpb24gPSBvcHRpb25zLmNvbGxlY3Rpb247XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbGxlY3Rpb24gPSBuZXcgTW9uZ28uQ29sbGVjdGlvbihjb2xsZWN0aW9uTmFtZSwge1xuICAgICAgICBfcHJldmVudEF1dG9wdWJsaXNoOiB0cnVlLFxuICAgICAgICBjb25uZWN0aW9uOiB0aGlzLmNvbm5lY3Rpb24sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29sbGVjdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBHZXQgdGhlIGN1cnJlbnQgdXNlciBpZCwgb3IgYG51bGxgIGlmIG5vIHVzZXIgaXMgbG9nZ2VkIGluLiBBIHJlYWN0aXZlIGRhdGEgc291cmNlLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICovXG4gIHVzZXJJZCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3VzZXJJZCBtZXRob2Qgbm90IGltcGxlbWVudGVkJyk7XG4gIH1cblxuICAvLyBtZXJnZSB0aGUgZGVmYXVsdEZpZWxkU2VsZWN0b3Igd2l0aCBhbiBleGlzdGluZyBvcHRpb25zIG9iamVjdFxuICBfYWRkRGVmYXVsdEZpZWxkU2VsZWN0b3Iob3B0aW9ucyA9IHt9KSB7XG4gICAgLy8gdGhpcyB3aWxsIGJlIHRoZSBtb3N0IGNvbW1vbiBjYXNlIGZvciBtb3N0IHBlb3BsZSwgc28gbWFrZSBpdCBxdWlja1xuICAgIGlmICghdGhpcy5fb3B0aW9ucy5kZWZhdWx0RmllbGRTZWxlY3RvcikgcmV0dXJuIG9wdGlvbnM7XG5cbiAgICAvLyBpZiBubyBmaWVsZCBzZWxlY3RvciB0aGVuIGp1c3QgdXNlIGRlZmF1bHRGaWVsZFNlbGVjdG9yXG4gICAgaWYgKCFvcHRpb25zLmZpZWxkcylcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgIGZpZWxkczogdGhpcy5fb3B0aW9ucy5kZWZhdWx0RmllbGRTZWxlY3RvcixcbiAgICAgIH07XG5cbiAgICAvLyBpZiBlbXB0eSBmaWVsZCBzZWxlY3RvciB0aGVuIHRoZSBmdWxsIHVzZXIgb2JqZWN0IGlzIGV4cGxpY2l0bHkgcmVxdWVzdGVkLCBzbyBvYmV5XG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG9wdGlvbnMuZmllbGRzKTtcbiAgICBpZiAoIWtleXMubGVuZ3RoKSByZXR1cm4gb3B0aW9ucztcblxuICAgIC8vIGlmIHRoZSByZXF1ZXN0ZWQgZmllbGRzIGFyZSArdmUgdGhlbiBpZ25vcmUgZGVmYXVsdEZpZWxkU2VsZWN0b3JcbiAgICAvLyBhc3N1bWUgdGhleSBhcmUgYWxsIGVpdGhlciArdmUgb3IgLXZlIGJlY2F1c2UgTW9uZ28gZG9lc24ndCBsaWtlIG1peGVkXG4gICAgaWYgKCEhb3B0aW9ucy5maWVsZHNba2V5c1swXV0pIHJldHVybiBvcHRpb25zO1xuXG4gICAgLy8gVGhlIHJlcXVlc3RlZCBmaWVsZHMgYXJlIC12ZS5cbiAgICAvLyBJZiB0aGUgZGVmYXVsdEZpZWxkU2VsZWN0b3IgaXMgK3ZlIHRoZW4gdXNlIHJlcXVlc3RlZCBmaWVsZHMsIG90aGVyd2lzZSBtZXJnZSB0aGVtXG4gICAgY29uc3Qga2V5czIgPSBPYmplY3Qua2V5cyh0aGlzLl9vcHRpb25zLmRlZmF1bHRGaWVsZFNlbGVjdG9yKTtcbiAgICByZXR1cm4gdGhpcy5fb3B0aW9ucy5kZWZhdWx0RmllbGRTZWxlY3RvcltrZXlzMlswXV1cbiAgICAgID8gb3B0aW9uc1xuICAgICAgOiB7XG4gICAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICAgIC4uLm9wdGlvbnMuZmllbGRzLFxuICAgICAgICAgICAgLi4udGhpcy5fb3B0aW9ucy5kZWZhdWx0RmllbGRTZWxlY3RvcixcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEdldCB0aGUgY3VycmVudCB1c2VyIHJlY29yZCwgb3IgYG51bGxgIGlmIG5vIHVzZXIgaXMgbG9nZ2VkIGluLiBBIHJlYWN0aXZlIGRhdGEgc291cmNlLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge01vbmdvRmllbGRTcGVjaWZpZXJ9IG9wdGlvbnMuZmllbGRzIERpY3Rpb25hcnkgb2YgZmllbGRzIHRvIHJldHVybiBvciBleGNsdWRlLlxuICAgKi9cbiAgdXNlcihvcHRpb25zKSB7XG4gICAgY29uc3QgdXNlcklkID0gdGhpcy51c2VySWQoKTtcbiAgICByZXR1cm4gdXNlcklkXG4gICAgICA/IHRoaXMudXNlcnMuZmluZE9uZSh1c2VySWQsIHRoaXMuX2FkZERlZmF1bHRGaWVsZFNlbGVjdG9yKG9wdGlvbnMpKVxuICAgICAgOiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEdldCB0aGUgY3VycmVudCB1c2VyIHJlY29yZCwgb3IgYG51bGxgIGlmIG5vIHVzZXIgaXMgbG9nZ2VkIGluLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgKiBAcGFyYW0ge01vbmdvRmllbGRTcGVjaWZpZXJ9IG9wdGlvbnMuZmllbGRzIERpY3Rpb25hcnkgb2YgZmllbGRzIHRvIHJldHVybiBvciBleGNsdWRlLlxuICAgKi9cbiAgYXN5bmMgdXNlckFzeW5jKG9wdGlvbnMpIHtcbiAgICBjb25zdCB1c2VySWQgPSB0aGlzLnVzZXJJZCgpO1xuICAgIHJldHVybiB1c2VySWRcbiAgICAgID8gdGhpcy51c2Vycy5maW5kT25lQXN5bmModXNlcklkLCB0aGlzLl9hZGREZWZhdWx0RmllbGRTZWxlY3RvcihvcHRpb25zKSlcbiAgICAgIDogbnVsbDtcbiAgfVxuICAvLyBTZXQgdXAgY29uZmlnIGZvciB0aGUgYWNjb3VudHMgc3lzdGVtLiBDYWxsIHRoaXMgb24gYm90aCB0aGUgY2xpZW50XG4gIC8vIGFuZCB0aGUgc2VydmVyLlxuICAvL1xuICAvLyBOb3RlIHRoYXQgdGhpcyBtZXRob2QgZ2V0cyBvdmVycmlkZGVuIG9uIEFjY291bnRzU2VydmVyLnByb3RvdHlwZSwgYnV0XG4gIC8vIHRoZSBvdmVycmlkaW5nIG1ldGhvZCBjYWxscyB0aGUgb3ZlcnJpZGRlbiBtZXRob2QuXG4gIC8vXG4gIC8vIFhYWCB3ZSBzaG91bGQgYWRkIHNvbWUgZW5mb3JjZW1lbnQgdGhhdCB0aGlzIGlzIGNhbGxlZCBvbiBib3RoIHRoZVxuICAvLyBjbGllbnQgYW5kIHRoZSBzZXJ2ZXIuIE90aGVyd2lzZSwgYSB1c2VyIGNhblxuICAvLyAnZm9yYmlkQ2xpZW50QWNjb3VudENyZWF0aW9uJyBvbmx5IG9uIHRoZSBjbGllbnQgYW5kIHdoaWxlIGl0IGxvb2tzXG4gIC8vIGxpa2UgdGhlaXIgYXBwIGlzIHNlY3VyZSwgdGhlIHNlcnZlciB3aWxsIHN0aWxsIGFjY2VwdCBjcmVhdGVVc2VyXG4gIC8vIGNhbGxzLiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9pc3N1ZXMvODI4XG4gIC8vXG4gIC8vIEBwYXJhbSBvcHRpb25zIHtPYmplY3R9IGFuIG9iamVjdCB3aXRoIGZpZWxkczpcbiAgLy8gLSBzZW5kVmVyaWZpY2F0aW9uRW1haWwge0Jvb2xlYW59XG4gIC8vICAgICBTZW5kIGVtYWlsIGFkZHJlc3MgdmVyaWZpY2F0aW9uIGVtYWlscyB0byBuZXcgdXNlcnMgY3JlYXRlZCBmcm9tXG4gIC8vICAgICBjbGllbnQgc2lnbnVwcy5cbiAgLy8gLSBmb3JiaWRDbGllbnRBY2NvdW50Q3JlYXRpb24ge0Jvb2xlYW59XG4gIC8vICAgICBEbyBub3QgYWxsb3cgY2xpZW50cyB0byBjcmVhdGUgYWNjb3VudHMgZGlyZWN0bHkuXG4gIC8vIC0gcmVzdHJpY3RDcmVhdGlvbkJ5RW1haWxEb21haW4ge0Z1bmN0aW9uIG9yIFN0cmluZ31cbiAgLy8gICAgIFJlcXVpcmUgY3JlYXRlZCB1c2VycyB0byBoYXZlIGFuIGVtYWlsIG1hdGNoaW5nIHRoZSBmdW5jdGlvbiBvclxuICAvLyAgICAgaGF2aW5nIHRoZSBzdHJpbmcgYXMgZG9tYWluLlxuICAvLyAtIGxvZ2luRXhwaXJhdGlvbkluRGF5cyB7TnVtYmVyfVxuICAvLyAgICAgTnVtYmVyIG9mIGRheXMgc2luY2UgbG9naW4gdW50aWwgYSB1c2VyIGlzIGxvZ2dlZCBvdXQgKGxvZ2luIHRva2VuXG4gIC8vICAgICBleHBpcmVzKS5cbiAgLy8gLSBjb2xsZWN0aW9uIHtTdHJpbmd8TW9uZ28uQ29sbGVjdGlvbn1cbiAgLy8gICAgIEEgY29sbGVjdGlvbiBuYW1lIG9yIGEgTW9uZ28uQ29sbGVjdGlvbiBvYmplY3QgdG8gaG9sZCB0aGUgdXNlcnMuXG4gIC8vIC0gcGFzc3dvcmRSZXNldFRva2VuRXhwaXJhdGlvbkluRGF5cyB7TnVtYmVyfVxuICAvLyAgICAgTnVtYmVyIG9mIGRheXMgc2luY2UgcGFzc3dvcmQgcmVzZXQgdG9rZW4gY3JlYXRpb24gdW50aWwgdGhlXG4gIC8vICAgICB0b2tlbiBjYW5udCBiZSB1c2VkIGFueSBsb25nZXIgKHBhc3N3b3JkIHJlc2V0IHRva2VuIGV4cGlyZXMpLlxuICAvLyAtIGFtYmlndW91c0Vycm9yTWVzc2FnZXMge0Jvb2xlYW59XG4gIC8vICAgICBSZXR1cm4gYW1iaWd1b3VzIGVycm9yIG1lc3NhZ2VzIGZyb20gbG9naW4gZmFpbHVyZXMgdG8gcHJldmVudFxuICAvLyAgICAgdXNlciBlbnVtZXJhdGlvbi5cbiAgLy8gLSBiY3J5cHRSb3VuZHMge051bWJlcn1cbiAgLy8gICAgIEFsbG93cyBvdmVycmlkZSBvZiBudW1iZXIgb2YgYmNyeXB0IHJvdW5kcyAoYWthIHdvcmsgZmFjdG9yKSB1c2VkXG4gIC8vICAgICB0byBzdG9yZSBwYXNzd29yZHMuXG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IFNldCBnbG9iYWwgYWNjb3VudHMgb3B0aW9ucy4gWW91IGNhbiBhbHNvIHNldCB0aGVzZSBpbiBgTWV0ZW9yLnNldHRpbmdzLnBhY2thZ2VzLmFjY291bnRzYCB3aXRob3V0IHRoZSBuZWVkIHRvIGNhbGwgdGhpcyBmdW5jdGlvbi5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5zZW5kVmVyaWZpY2F0aW9uRW1haWwgTmV3IHVzZXJzIHdpdGggYW4gZW1haWwgYWRkcmVzcyB3aWxsIHJlY2VpdmUgYW4gYWRkcmVzcyB2ZXJpZmljYXRpb24gZW1haWwuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3B0aW9ucy5mb3JiaWRDbGllbnRBY2NvdW50Q3JlYXRpb24gQ2FsbHMgdG8gW2BjcmVhdGVVc2VyYF0oI2FjY291bnRzX2NyZWF0ZXVzZXIpIGZyb20gdGhlIGNsaWVudCB3aWxsIGJlIHJlamVjdGVkLiBJbiBhZGRpdGlvbiwgaWYgeW91IGFyZSB1c2luZyBbYWNjb3VudHMtdWldKCNhY2NvdW50c3VpKSwgdGhlIFwiQ3JlYXRlIGFjY291bnRcIiBsaW5rIHdpbGwgbm90IGJlIGF2YWlsYWJsZS5cbiAgICogQHBhcmFtIHtTdHJpbmcgfCBGdW5jdGlvbn0gb3B0aW9ucy5yZXN0cmljdENyZWF0aW9uQnlFbWFpbERvbWFpbiBJZiBzZXQgdG8gYSBzdHJpbmcsIG9ubHkgYWxsb3dzIG5ldyB1c2VycyBpZiB0aGUgZG9tYWluIHBhcnQgb2YgdGhlaXIgZW1haWwgYWRkcmVzcyBtYXRjaGVzIHRoZSBzdHJpbmcuIElmIHNldCB0byBhIGZ1bmN0aW9uLCBvbmx5IGFsbG93cyBuZXcgdXNlcnMgaWYgdGhlIGZ1bmN0aW9uIHJldHVybnMgdHJ1ZS4gIFRoZSBmdW5jdGlvbiBpcyBwYXNzZWQgdGhlIGZ1bGwgZW1haWwgYWRkcmVzcyBvZiB0aGUgcHJvcG9zZWQgbmV3IHVzZXIuICBXb3JrcyB3aXRoIHBhc3N3b3JkLWJhc2VkIHNpZ24taW4gYW5kIGV4dGVybmFsIHNlcnZpY2VzIHRoYXQgZXhwb3NlIGVtYWlsIGFkZHJlc3NlcyAoR29vZ2xlLCBGYWNlYm9vaywgR2l0SHViKS4gQWxsIGV4aXN0aW5nIHVzZXJzIHN0aWxsIGNhbiBsb2cgaW4gYWZ0ZXIgZW5hYmxpbmcgdGhpcyBvcHRpb24uIEV4YW1wbGU6IGBBY2NvdW50cy5jb25maWcoeyByZXN0cmljdENyZWF0aW9uQnlFbWFpbERvbWFpbjogJ3NjaG9vbC5lZHUnIH0pYC5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMubG9naW5FeHBpcmF0aW9uSW5EYXlzIFRoZSBudW1iZXIgb2YgZGF5cyBmcm9tIHdoZW4gYSB1c2VyIGxvZ3MgaW4gdW50aWwgdGhlaXIgdG9rZW4gZXhwaXJlcyBhbmQgdGhleSBhcmUgbG9nZ2VkIG91dC4gRGVmYXVsdHMgdG8gOTAuIFNldCB0byBgbnVsbGAgdG8gZGlzYWJsZSBsb2dpbiBleHBpcmF0aW9uLlxuICAgKiBAcGFyYW0ge051bWJlcn0gb3B0aW9ucy5sb2dpbkV4cGlyYXRpb24gVGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgZnJvbSB3aGVuIGEgdXNlciBsb2dzIGluIHVudGlsIHRoZWlyIHRva2VuIGV4cGlyZXMgYW5kIHRoZXkgYXJlIGxvZ2dlZCBvdXQsIGZvciBhIG1vcmUgZ3JhbnVsYXIgY29udHJvbC4gSWYgYGxvZ2luRXhwaXJhdGlvbkluRGF5c2AgaXMgc2V0LCBpdCB0YWtlcyBwcmVjZWRlbnQuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25zLm9hdXRoU2VjcmV0S2V5IFdoZW4gdXNpbmcgdGhlIGBvYXV0aC1lbmNyeXB0aW9uYCBwYWNrYWdlLCB0aGUgMTYgYnl0ZSBrZXkgdXNpbmcgdG8gZW5jcnlwdCBzZW5zaXRpdmUgYWNjb3VudCBjcmVkZW50aWFscyBpbiB0aGUgZGF0YWJhc2UsIGVuY29kZWQgaW4gYmFzZTY0LiAgVGhpcyBvcHRpb24gbWF5IG9ubHkgYmUgc3BlY2lmaWVkIG9uIHRoZSBzZXJ2ZXIuICBTZWUgcGFja2FnZXMvb2F1dGgtZW5jcnlwdGlvbi9SRUFETUUubWQgZm9yIGRldGFpbHMuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLnBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyYXRpb25JbkRheXMgVGhlIG51bWJlciBvZiBkYXlzIGZyb20gd2hlbiBhIGxpbmsgdG8gcmVzZXQgcGFzc3dvcmQgaXMgc2VudCB1bnRpbCB0b2tlbiBleHBpcmVzIGFuZCB1c2VyIGNhbid0IHJlc2V0IHBhc3N3b3JkIHdpdGggdGhlIGxpbmsgYW55bW9yZS4gRGVmYXVsdHMgdG8gMy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMucGFzc3dvcmRSZXNldFRva2VuRXhwaXJhdGlvbiBUaGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyBmcm9tIHdoZW4gYSBsaW5rIHRvIHJlc2V0IHBhc3N3b3JkIGlzIHNlbnQgdW50aWwgdG9rZW4gZXhwaXJlcyBhbmQgdXNlciBjYW4ndCByZXNldCBwYXNzd29yZCB3aXRoIHRoZSBsaW5rIGFueW1vcmUuIElmIGBwYXNzd29yZFJlc2V0VG9rZW5FeHBpcmF0aW9uSW5EYXlzYCBpcyBzZXQsIGl0IHRha2VzIHByZWNlZGVudC5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbnMucGFzc3dvcmRFbnJvbGxUb2tlbkV4cGlyYXRpb25JbkRheXMgVGhlIG51bWJlciBvZiBkYXlzIGZyb20gd2hlbiBhIGxpbmsgdG8gc2V0IGluaXRpYWwgcGFzc3dvcmQgaXMgc2VudCB1bnRpbCB0b2tlbiBleHBpcmVzIGFuZCB1c2VyIGNhbid0IHNldCBwYXNzd29yZCB3aXRoIHRoZSBsaW5rIGFueW1vcmUuIERlZmF1bHRzIHRvIDMwLlxuICAgKiBAcGFyYW0ge051bWJlcn0gb3B0aW9ucy5wYXNzd29yZEVucm9sbFRva2VuRXhwaXJhdGlvbiBUaGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyBmcm9tIHdoZW4gYSBsaW5rIHRvIHNldCBpbml0aWFsIHBhc3N3b3JkIGlzIHNlbnQgdW50aWwgdG9rZW4gZXhwaXJlcyBhbmQgdXNlciBjYW4ndCBzZXQgcGFzc3dvcmQgd2l0aCB0aGUgbGluayBhbnltb3JlLiBJZiBgcGFzc3dvcmRFbnJvbGxUb2tlbkV4cGlyYXRpb25JbkRheXNgIGlzIHNldCwgaXQgdGFrZXMgcHJlY2VkZW50LlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IG9wdGlvbnMuYW1iaWd1b3VzRXJyb3JNZXNzYWdlcyBSZXR1cm4gYW1iaWd1b3VzIGVycm9yIG1lc3NhZ2VzIGZyb20gbG9naW4gZmFpbHVyZXMgdG8gcHJldmVudCB1c2VyIGVudW1lcmF0aW9uLiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICogQHBhcmFtIHtNb25nb0ZpZWxkU3BlY2lmaWVyfSBvcHRpb25zLmRlZmF1bHRGaWVsZFNlbGVjdG9yIFRvIGV4Y2x1ZGUgYnkgZGVmYXVsdCBsYXJnZSBjdXN0b20gZmllbGRzIGZyb20gYE1ldGVvci51c2VyKClgIGFuZCBgTWV0ZW9yLmZpbmRVc2VyQnkuLi4oKWAgZnVuY3Rpb25zIHdoZW4gY2FsbGVkIHdpdGhvdXQgYSBmaWVsZCBzZWxlY3RvciwgYW5kIGFsbCBgb25Mb2dpbmAsIGBvbkxvZ2luRmFpbHVyZWAgYW5kIGBvbkxvZ291dGAgY2FsbGJhY2tzLiAgRXhhbXBsZTogYEFjY291bnRzLmNvbmZpZyh7IGRlZmF1bHRGaWVsZFNlbGVjdG9yOiB7IG15QmlnQXJyYXk6IDAgfX0pYC4gQmV3YXJlIHdoZW4gdXNpbmcgdGhpcy4gSWYsIGZvciBpbnN0YW5jZSwgeW91IGRvIG5vdCBpbmNsdWRlIGBlbWFpbGAgd2hlbiBleGNsdWRpbmcgdGhlIGZpZWxkcywgeW91IGNhbiBoYXZlIHByb2JsZW1zIHdpdGggZnVuY3Rpb25zIGxpa2UgYGZvcmdvdFBhc3N3b3JkYCB0aGF0IHdpbGwgYnJlYWsgYmVjYXVzZSB0aGV5IHdvbid0IGhhdmUgdGhlIHJlcXVpcmVkIGRhdGEgYXZhaWxhYmxlLiBJdCdzIHJlY29tbWVuZCB0aGF0IHlvdSBhbHdheXMga2VlcCB0aGUgZmllbGRzIGBfaWRgLCBgdXNlcm5hbWVgLCBhbmQgYGVtYWlsYC5cbiAgICogQHBhcmFtIHtTdHJpbmd8TW9uZ28uQ29sbGVjdGlvbn0gb3B0aW9ucy5jb2xsZWN0aW9uIEEgY29sbGVjdGlvbiBuYW1lIG9yIGEgTW9uZ28uQ29sbGVjdGlvbiBvYmplY3QgdG8gaG9sZCB0aGUgdXNlcnMuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLmxvZ2luVG9rZW5FeHBpcmF0aW9uSG91cnMgV2hlbiB1c2luZyB0aGUgcGFja2FnZSBgYWNjb3VudHMtMmZhYCwgdXNlIHRoaXMgdG8gc2V0IHRoZSBhbW91bnQgb2YgdGltZSBhIHRva2VuIHNlbnQgaXMgdmFsaWQuIEFzIGl0J3MganVzdCBhIG51bWJlciwgeW91IGNhbiB1c2UsIGZvciBleGFtcGxlLCAwLjUgdG8gbWFrZSB0aGUgdG9rZW4gdmFsaWQgZm9yIGp1c3QgaGFsZiBob3VyLiBUaGUgZGVmYXVsdCBpcyAxIGhvdXIuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBvcHRpb25zLnRva2VuU2VxdWVuY2VMZW5ndGggV2hlbiB1c2luZyB0aGUgcGFja2FnZSBgYWNjb3VudHMtMmZhYCwgdXNlIHRoaXMgdG8gdGhlIHNpemUgb2YgdGhlIHRva2VuIHNlcXVlbmNlIGdlbmVyYXRlZC4gVGhlIGRlZmF1bHQgaXMgNi5cbiAgICovXG4gIGNvbmZpZyhvcHRpb25zKSB7XG4gICAgLy8gV2UgZG9uJ3Qgd2FudCB1c2VycyB0byBhY2NpZGVudGFsbHkgb25seSBjYWxsIEFjY291bnRzLmNvbmZpZyBvbiB0aGVcbiAgICAvLyBjbGllbnQsIHdoZXJlIHNvbWUgb2YgdGhlIG9wdGlvbnMgd2lsbCBoYXZlIHBhcnRpYWwgZWZmZWN0cyAoZWcgcmVtb3ZpbmdcbiAgICAvLyB0aGUgXCJjcmVhdGUgYWNjb3VudFwiIGJ1dHRvbiBmcm9tIGFjY291bnRzLXVpIGlmIGZvcmJpZENsaWVudEFjY291bnRDcmVhdGlvblxuICAgIC8vIGlzIHNldCwgb3IgcmVkaXJlY3RpbmcgR29vZ2xlIGxvZ2luIHRvIGEgc3BlY2lmaWMtZG9tYWluIHBhZ2UpIHdpdGhvdXRcbiAgICAvLyBoYXZpbmcgdGhlaXIgZnVsbCBlZmZlY3RzLlxuICAgIGlmIChNZXRlb3IuaXNTZXJ2ZXIpIHtcbiAgICAgIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uYWNjb3VudHNDb25maWdDYWxsZWQgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoIV9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18uYWNjb3VudHNDb25maWdDYWxsZWQpIHtcbiAgICAgIC8vIFhYWCB3b3VsZCBiZSBuaWNlIHRvIFwiY3Jhc2hcIiB0aGUgY2xpZW50IGFuZCByZXBsYWNlIHRoZSBVSSB3aXRoIGFuIGVycm9yXG4gICAgICAvLyBtZXNzYWdlLCBidXQgdGhlcmUncyBubyB0cml2aWFsIHdheSB0byBkbyB0aGlzLlxuICAgICAgTWV0ZW9yLl9kZWJ1ZyhcbiAgICAgICAgJ0FjY291bnRzLmNvbmZpZyB3YXMgY2FsbGVkIG9uIHRoZSBjbGllbnQgYnV0IG5vdCBvbiB0aGUgJyArXG4gICAgICAgICAgJ3NlcnZlcjsgc29tZSBjb25maWd1cmF0aW9uIG9wdGlvbnMgbWF5IG5vdCB0YWtlIGVmZmVjdC4nXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFdlIG5lZWQgdG8gdmFsaWRhdGUgdGhlIG9hdXRoU2VjcmV0S2V5IG9wdGlvbiBhdCB0aGUgdGltZVxuICAgIC8vIEFjY291bnRzLmNvbmZpZyBpcyBjYWxsZWQuIFdlIGFsc28gZGVsaWJlcmF0ZWx5IGRvbid0IHN0b3JlIHRoZVxuICAgIC8vIG9hdXRoU2VjcmV0S2V5IGluIEFjY291bnRzLl9vcHRpb25zLlxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywgJ29hdXRoU2VjcmV0S2V5JykpIHtcbiAgICAgIGlmIChNZXRlb3IuaXNDbGllbnQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdUaGUgb2F1dGhTZWNyZXRLZXkgb3B0aW9uIG1heSBvbmx5IGJlIHNwZWNpZmllZCBvbiB0aGUgc2VydmVyJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFQYWNrYWdlWydvYXV0aC1lbmNyeXB0aW9uJ10pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdUaGUgb2F1dGgtZW5jcnlwdGlvbiBwYWNrYWdlIG11c3QgYmUgbG9hZGVkIHRvIHNldCBvYXV0aFNlY3JldEtleSdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIFBhY2thZ2VbJ29hdXRoLWVuY3J5cHRpb24nXS5PQXV0aEVuY3J5cHRpb24ubG9hZEtleShcbiAgICAgICAgb3B0aW9ucy5vYXV0aFNlY3JldEtleVxuICAgICAgKTtcbiAgICAgIG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMgfTtcbiAgICAgIGRlbGV0ZSBvcHRpb25zLm9hdXRoU2VjcmV0S2V5O1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGNvbmZpZyBvcHRpb25zIGtleXNcbiAgICBPYmplY3Qua2V5cyhvcHRpb25zKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoIVZBTElEX0NPTkZJR19LRVlTLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgLy8gVE9ETyBDb25zaWRlciBqdXN0IGxvZ2dpbmcgYSBkZWJ1ZyBtZXNzYWdlIGluc3RlYWQgdG8gYWxsb3cgZm9yIGFkZGl0aW9uYWwga2V5cyBpbiB0aGUgc2V0dGluZ3MgaGVyZT9cbiAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcihgQWNjb3VudHMuY29uZmlnOiBJbnZhbGlkIGtleTogJHtrZXl9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBzZXQgdmFsdWVzIGluIEFjY291bnRzLl9vcHRpb25zXG4gICAgVkFMSURfQ09ORklHX0tFWVMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSBpbiBvcHRpb25zKSB7XG4gICAgICAgIGlmIChrZXkgaW4gdGhpcy5fb3B0aW9ucykge1xuICAgICAgICAgIGlmIChrZXkgIT09ICdjb2xsZWN0aW9uJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcihgQ2FuJ3Qgc2V0IFxcYCR7a2V5fVxcYCBtb3JlIHRoYW4gb25jZWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9vcHRpb25zW2tleV0gPSBvcHRpb25zW2tleV07XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAob3B0aW9ucy5jb2xsZWN0aW9uICYmIG9wdGlvbnMuY29sbGVjdGlvbiAhPT0gdGhpcy51c2Vycy5fbmFtZSAmJiBvcHRpb25zLmNvbGxlY3Rpb24gIT09IHRoaXMudXNlcnMpIHtcbiAgICAgIHRoaXMudXNlcnMgPSB0aGlzLl9pbml0aWFsaXplQ29sbGVjdGlvbihvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgUmVnaXN0ZXIgYSBjYWxsYmFjayB0byBiZSBjYWxsZWQgYWZ0ZXIgYSBsb2dpbiBhdHRlbXB0IHN1Y2NlZWRzLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gbG9naW4gaXMgc3VjY2Vzc2Z1bC5cbiAgICogICAgICAgICAgICAgICAgICAgICAgICBUaGUgY2FsbGJhY2sgcmVjZWl2ZXMgYSBzaW5nbGUgb2JqZWN0IHRoYXRcbiAgICogICAgICAgICAgICAgICAgICAgICAgICBob2xkcyBsb2dpbiBkZXRhaWxzLiBUaGlzIG9iamVjdCBjb250YWlucyB0aGUgbG9naW5cbiAgICogICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgdHlwZSAocGFzc3dvcmQsIHJlc3VtZSwgZXRjLikgb24gYm90aCB0aGVcbiAgICogICAgICAgICAgICAgICAgICAgICAgICBjbGllbnQgYW5kIHNlcnZlci4gYG9uTG9naW5gIGNhbGxiYWNrcyByZWdpc3RlcmVkXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgb24gdGhlIHNlcnZlciBhbHNvIHJlY2VpdmUgZXh0cmEgZGF0YSwgc3VjaFxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgIGFzIHVzZXIgZGV0YWlscywgY29ubmVjdGlvbiBpbmZvcm1hdGlvbiwgZXRjLlxuICAgKi9cbiAgb25Mb2dpbihmdW5jKSB7XG4gICAgbGV0IHJldCA9IHRoaXMuX29uTG9naW5Ib29rLnJlZ2lzdGVyKGZ1bmMpO1xuICAgIC8vIGNhbGwgdGhlIGp1c3QgcmVnaXN0ZXJlZCBjYWxsYmFjayBpZiBhbHJlYWR5IGxvZ2dlZCBpblxuICAgIHRoaXMuX3N0YXJ0dXBDYWxsYmFjayhyZXQuY2FsbGJhY2spO1xuICAgIHJldHVybiByZXQ7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgUmVnaXN0ZXIgYSBjYWxsYmFjayB0byBiZSBjYWxsZWQgYWZ0ZXIgYSBsb2dpbiBhdHRlbXB0IGZhaWxzLlxuICAgKiBAbG9jdXMgQW55d2hlcmVcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGFmdGVyIHRoZSBsb2dpbiBoYXMgZmFpbGVkLlxuICAgKi9cbiAgb25Mb2dpbkZhaWx1cmUoZnVuYykge1xuICAgIHJldHVybiB0aGlzLl9vbkxvZ2luRmFpbHVyZUhvb2sucmVnaXN0ZXIoZnVuYyk7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgUmVnaXN0ZXIgYSBjYWxsYmFjayB0byBiZSBjYWxsZWQgYWZ0ZXIgYSBsb2dvdXQgYXR0ZW1wdCBzdWNjZWVkcy5cbiAgICogQGxvY3VzIEFueXdoZXJlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCB3aGVuIGxvZ291dCBpcyBzdWNjZXNzZnVsLlxuICAgKi9cbiAgb25Mb2dvdXQoZnVuYykge1xuICAgIHJldHVybiB0aGlzLl9vbkxvZ291dEhvb2sucmVnaXN0ZXIoZnVuYyk7XG4gIH1cblxuICBfaW5pdENvbm5lY3Rpb24ob3B0aW9ucykge1xuICAgIGlmICghTWV0ZW9yLmlzQ2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVGhlIGNvbm5lY3Rpb24gdXNlZCBieSB0aGUgQWNjb3VudHMgc3lzdGVtLiBUaGlzIGlzIHRoZSBjb25uZWN0aW9uXG4gICAgLy8gdGhhdCB3aWxsIGdldCBsb2dnZWQgaW4gYnkgTWV0ZW9yLmxvZ2luKCksIGFuZCB0aGlzIGlzIHRoZVxuICAgIC8vIGNvbm5lY3Rpb24gd2hvc2UgbG9naW4gc3RhdGUgd2lsbCBiZSByZWZsZWN0ZWQgYnkgTWV0ZW9yLnVzZXJJZCgpLlxuICAgIC8vXG4gICAgLy8gSXQgd291bGQgYmUgbXVjaCBwcmVmZXJhYmxlIGZvciB0aGlzIHRvIGJlIGluIGFjY291bnRzX2NsaWVudC5qcyxcbiAgICAvLyBidXQgaXQgaGFzIHRvIGJlIGhlcmUgYmVjYXVzZSBpdCdzIG5lZWRlZCB0byBjcmVhdGUgdGhlXG4gICAgLy8gTWV0ZW9yLnVzZXJzIGNvbGxlY3Rpb24uXG4gICAgaWYgKG9wdGlvbnMuY29ubmVjdGlvbikge1xuICAgICAgdGhpcy5jb25uZWN0aW9uID0gb3B0aW9ucy5jb25uZWN0aW9uO1xuICAgIH0gZWxzZSBpZiAob3B0aW9ucy5kZHBVcmwpIHtcbiAgICAgIHRoaXMuY29ubmVjdGlvbiA9IEREUC5jb25uZWN0KG9wdGlvbnMuZGRwVXJsKTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIF9fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18gIT09ICd1bmRlZmluZWQnICYmXG4gICAgICBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLkFDQ09VTlRTX0NPTk5FQ1RJT05fVVJMXG4gICAgKSB7XG4gICAgICAvLyBUZW1wb3JhcnksIGludGVybmFsIGhvb2sgdG8gYWxsb3cgdGhlIHNlcnZlciB0byBwb2ludCB0aGUgY2xpZW50XG4gICAgICAvLyB0byBhIGRpZmZlcmVudCBhdXRoZW50aWNhdGlvbiBzZXJ2ZXIuIFRoaXMgaXMgZm9yIGEgdmVyeVxuICAgICAgLy8gcGFydGljdWxhciB1c2UgY2FzZSB0aGF0IGNvbWVzIHVwIHdoZW4gaW1wbGVtZW50aW5nIGEgb2F1dGhcbiAgICAgIC8vIHNlcnZlci4gVW5zdXBwb3J0ZWQgYW5kIG1heSBnbyBhd2F5IGF0IGFueSBwb2ludCBpbiB0aW1lLlxuICAgICAgLy9cbiAgICAgIC8vIFdlIHdpbGwgZXZlbnR1YWxseSBwcm92aWRlIGEgZ2VuZXJhbCB3YXkgdG8gdXNlIGFjY291bnQtYmFzZVxuICAgICAgLy8gYWdhaW5zdCBhbnkgRERQIGNvbm5lY3Rpb24sIG5vdCBqdXN0IG9uZSBzcGVjaWFsIG9uZS5cbiAgICAgIHRoaXMuY29ubmVjdGlvbiA9IEREUC5jb25uZWN0KFxuICAgICAgICBfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fLkFDQ09VTlRTX0NPTk5FQ1RJT05fVVJMXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmNvbm5lY3Rpb24gPSBNZXRlb3IuY29ubmVjdGlvbjtcbiAgICB9XG4gIH1cblxuICBfZ2V0VG9rZW5MaWZldGltZU1zKCkge1xuICAgIC8vIFdoZW4gbG9naW5FeHBpcmF0aW9uSW5EYXlzIGlzIHNldCB0byBudWxsLCB3ZSdsbCB1c2UgYSByZWFsbHkgaGlnaFxuICAgIC8vIG51bWJlciBvZiBkYXlzIChMT0dJTl9VTkVYUElSQUJMRV9UT0tFTl9EQVlTKSB0byBzaW11bGF0ZSBhblxuICAgIC8vIHVuZXhwaXJpbmcgdG9rZW4uXG4gICAgY29uc3QgbG9naW5FeHBpcmF0aW9uSW5EYXlzID1cbiAgICAgIHRoaXMuX29wdGlvbnMubG9naW5FeHBpcmF0aW9uSW5EYXlzID09PSBudWxsXG4gICAgICAgID8gTE9HSU5fVU5FWFBJUklOR19UT0tFTl9EQVlTXG4gICAgICAgIDogdGhpcy5fb3B0aW9ucy5sb2dpbkV4cGlyYXRpb25JbkRheXM7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX29wdGlvbnMubG9naW5FeHBpcmF0aW9uIHx8XG4gICAgICAobG9naW5FeHBpcmF0aW9uSW5EYXlzIHx8IERFRkFVTFRfTE9HSU5fRVhQSVJBVElPTl9EQVlTKSAqIDg2NDAwMDAwXG4gICAgKTtcbiAgfVxuXG4gIF9nZXRQYXNzd29yZFJlc2V0VG9rZW5MaWZldGltZU1zKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLl9vcHRpb25zLnBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyYXRpb24gfHxcbiAgICAgICh0aGlzLl9vcHRpb25zLnBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyYXRpb25JbkRheXMgfHxcbiAgICAgICAgREVGQVVMVF9QQVNTV09SRF9SRVNFVF9UT0tFTl9FWFBJUkFUSU9OX0RBWVMpICogODY0MDAwMDBcbiAgICApO1xuICB9XG5cbiAgX2dldFBhc3N3b3JkRW5yb2xsVG9rZW5MaWZldGltZU1zKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLl9vcHRpb25zLnBhc3N3b3JkRW5yb2xsVG9rZW5FeHBpcmF0aW9uIHx8XG4gICAgICAodGhpcy5fb3B0aW9ucy5wYXNzd29yZEVucm9sbFRva2VuRXhwaXJhdGlvbkluRGF5cyB8fFxuICAgICAgICBERUZBVUxUX1BBU1NXT1JEX0VOUk9MTF9UT0tFTl9FWFBJUkFUSU9OX0RBWVMpICogODY0MDAwMDBcbiAgICApO1xuICB9XG5cbiAgX3Rva2VuRXhwaXJhdGlvbih3aGVuKSB7XG4gICAgLy8gV2UgcGFzcyB3aGVuIHRocm91Z2ggdGhlIERhdGUgY29uc3RydWN0b3IgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5O1xuICAgIC8vIGB3aGVuYCB1c2VkIHRvIGJlIGEgbnVtYmVyLlxuICAgIHJldHVybiBuZXcgRGF0ZShuZXcgRGF0ZSh3aGVuKS5nZXRUaW1lKCkgKyB0aGlzLl9nZXRUb2tlbkxpZmV0aW1lTXMoKSk7XG4gIH1cblxuICBfdG9rZW5FeHBpcmVzU29vbih3aGVuKSB7XG4gICAgbGV0IG1pbkxpZmV0aW1lTXMgPSAwLjEgKiB0aGlzLl9nZXRUb2tlbkxpZmV0aW1lTXMoKTtcbiAgICBjb25zdCBtaW5MaWZldGltZUNhcE1zID0gTUlOX1RPS0VOX0xJRkVUSU1FX0NBUF9TRUNTICogMTAwMDtcbiAgICBpZiAobWluTGlmZXRpbWVNcyA+IG1pbkxpZmV0aW1lQ2FwTXMpIHtcbiAgICAgIG1pbkxpZmV0aW1lTXMgPSBtaW5MaWZldGltZUNhcE1zO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IERhdGUoKSA+IG5ldyBEYXRlKHdoZW4pIC0gbWluTGlmZXRpbWVNcztcbiAgfVxuXG4gIC8vIE5vLW9wIG9uIHRoZSBzZXJ2ZXIsIG92ZXJyaWRkZW4gb24gdGhlIGNsaWVudC5cbiAgX3N0YXJ0dXBDYWxsYmFjayhjYWxsYmFjaykge31cbn1cblxuLy8gTm90ZSB0aGF0IEFjY291bnRzIGlzIGRlZmluZWQgc2VwYXJhdGVseSBpbiBhY2NvdW50c19jbGllbnQuanMgYW5kXG4vLyBhY2NvdW50c19zZXJ2ZXIuanMuXG5cbi8qKlxuICogQHN1bW1hcnkgR2V0IHRoZSBjdXJyZW50IHVzZXIgaWQsIG9yIGBudWxsYCBpZiBubyB1c2VyIGlzIGxvZ2dlZCBpbi4gQSByZWFjdGl2ZSBkYXRhIHNvdXJjZS5cbiAqIEBsb2N1cyBBbnl3aGVyZSBidXQgcHVibGlzaCBmdW5jdGlvbnNcbiAqIEBpbXBvcnRGcm9tUGFja2FnZSBtZXRlb3JcbiAqL1xuTWV0ZW9yLnVzZXJJZCA9ICgpID0+IEFjY291bnRzLnVzZXJJZCgpO1xuXG4vKipcbiAqIEBzdW1tYXJ5IEdldCB0aGUgY3VycmVudCB1c2VyIHJlY29yZCwgb3IgYG51bGxgIGlmIG5vIHVzZXIgaXMgbG9nZ2VkIGluLiBBIHJlYWN0aXZlIGRhdGEgc291cmNlLlxuICogQGxvY3VzIEFueXdoZXJlIGJ1dCBwdWJsaXNoIGZ1bmN0aW9uc1xuICogQGltcG9ydEZyb21QYWNrYWdlIG1ldGVvclxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICogQHBhcmFtIHtNb25nb0ZpZWxkU3BlY2lmaWVyfSBvcHRpb25zLmZpZWxkcyBEaWN0aW9uYXJ5IG9mIGZpZWxkcyB0byByZXR1cm4gb3IgZXhjbHVkZS5cbiAqL1xuTWV0ZW9yLnVzZXIgPSBvcHRpb25zID0+IEFjY291bnRzLnVzZXIob3B0aW9ucyk7XG5cbi8qKlxuICogQHN1bW1hcnkgR2V0IHRoZSBjdXJyZW50IHVzZXIgcmVjb3JkLCBvciBgbnVsbGAgaWYgbm8gdXNlciBpcyBsb2dnZWQgaW4uIEEgcmVhY3RpdmUgZGF0YSBzb3VyY2UuXG4gKiBAbG9jdXMgQW55d2hlcmUgYnV0IHB1Ymxpc2ggZnVuY3Rpb25zXG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgbWV0ZW9yXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gKiBAcGFyYW0ge01vbmdvRmllbGRTcGVjaWZpZXJ9IG9wdGlvbnMuZmllbGRzIERpY3Rpb25hcnkgb2YgZmllbGRzIHRvIHJldHVybiBvciBleGNsdWRlLlxuICovXG5NZXRlb3IudXNlckFzeW5jID0gb3B0aW9ucyA9PiBBY2NvdW50cy51c2VyQXN5bmMob3B0aW9ucyk7XG5cbi8vIGhvdyBsb25nIChpbiBkYXlzKSB1bnRpbCBhIGxvZ2luIHRva2VuIGV4cGlyZXNcbmNvbnN0IERFRkFVTFRfTE9HSU5fRVhQSVJBVElPTl9EQVlTID0gOTA7XG4vLyBob3cgbG9uZyAoaW4gZGF5cykgdW50aWwgcmVzZXQgcGFzc3dvcmQgdG9rZW4gZXhwaXJlc1xuY29uc3QgREVGQVVMVF9QQVNTV09SRF9SRVNFVF9UT0tFTl9FWFBJUkFUSU9OX0RBWVMgPSAzO1xuLy8gaG93IGxvbmcgKGluIGRheXMpIHVudGlsIGVucm9sIHBhc3N3b3JkIHRva2VuIGV4cGlyZXNcbmNvbnN0IERFRkFVTFRfUEFTU1dPUkRfRU5ST0xMX1RPS0VOX0VYUElSQVRJT05fREFZUyA9IDMwO1xuLy8gQ2xpZW50cyBkb24ndCB0cnkgdG8gYXV0by1sb2dpbiB3aXRoIGEgdG9rZW4gdGhhdCBpcyBnb2luZyB0byBleHBpcmUgd2l0aGluXG4vLyAuMSAqIERFRkFVTFRfTE9HSU5fRVhQSVJBVElPTl9EQVlTLCBjYXBwZWQgYXQgTUlOX1RPS0VOX0xJRkVUSU1FX0NBUF9TRUNTLlxuLy8gVHJpZXMgdG8gYXZvaWQgYWJydXB0IGRpc2Nvbm5lY3RzIGZyb20gZXhwaXJpbmcgdG9rZW5zLlxuY29uc3QgTUlOX1RPS0VOX0xJRkVUSU1FX0NBUF9TRUNTID0gMzYwMDsgLy8gb25lIGhvdXJcbi8vIGhvdyBvZnRlbiAoaW4gbWlsbGlzZWNvbmRzKSB3ZSBjaGVjayBmb3IgZXhwaXJlZCB0b2tlbnNcbmV4cG9ydCBjb25zdCBFWFBJUkVfVE9LRU5TX0lOVEVSVkFMX01TID0gNjAwICogMTAwMDsgLy8gMTAgbWludXRlc1xuLy8gQSBsYXJnZSBudW1iZXIgb2YgZXhwaXJhdGlvbiBkYXlzIChhcHByb3hpbWF0ZWx5IDEwMCB5ZWFycyB3b3J0aCkgdGhhdCBpc1xuLy8gdXNlZCB3aGVuIGNyZWF0aW5nIHVuZXhwaXJpbmcgdG9rZW5zLlxuY29uc3QgTE9HSU5fVU5FWFBJUklOR19UT0tFTl9EQVlTID0gMzY1ICogMTAwO1xuIiwiaW1wb3J0IGNyeXB0byBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcidcbmltcG9ydCB7XG4gIEFjY291bnRzQ29tbW9uLFxuICBFWFBJUkVfVE9LRU5TX0lOVEVSVkFMX01TLFxufSBmcm9tICcuL2FjY291bnRzX2NvbW1vbi5qcyc7XG5pbXBvcnQgeyBVUkwgfSBmcm9tICdtZXRlb3IvdXJsJztcblxuY29uc3QgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLy8gWFhYIG1heWJlIHRoaXMgYmVsb25ncyBpbiB0aGUgY2hlY2sgcGFja2FnZVxuY29uc3QgTm9uRW1wdHlTdHJpbmcgPSBNYXRjaC5XaGVyZSh4ID0+IHtcbiAgY2hlY2soeCwgU3RyaW5nKTtcbiAgcmV0dXJuIHgubGVuZ3RoID4gMDtcbn0pO1xuXG4vKipcbiAqIEBzdW1tYXJ5IENvbnN0cnVjdG9yIGZvciB0aGUgYEFjY291bnRzYCBuYW1lc3BhY2Ugb24gdGhlIHNlcnZlci5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBjbGFzcyBBY2NvdW50c1NlcnZlclxuICogQGV4dGVuZHMgQWNjb3VudHNDb21tb25cbiAqIEBpbnN0YW5jZW5hbWUgYWNjb3VudHNTZXJ2ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBzZXJ2ZXIgQSBzZXJ2ZXIgb2JqZWN0IHN1Y2ggYXMgYE1ldGVvci5zZXJ2ZXJgLlxuICovXG5leHBvcnQgY2xhc3MgQWNjb3VudHNTZXJ2ZXIgZXh0ZW5kcyBBY2NvdW50c0NvbW1vbiB7XG4gIC8vIE5vdGUgdGhhdCB0aGlzIGNvbnN0cnVjdG9yIGlzIGxlc3MgbGlrZWx5IHRvIGJlIGluc3RhbnRpYXRlZCBtdWx0aXBsZVxuICAvLyB0aW1lcyB0aGFuIHRoZSBgQWNjb3VudHNDbGllbnRgIGNvbnN0cnVjdG9yLCBiZWNhdXNlIGEgc2luZ2xlIHNlcnZlclxuICAvLyBjYW4gcHJvdmlkZSBvbmx5IG9uZSBzZXQgb2YgbWV0aG9kcy5cbiAgY29uc3RydWN0b3Ioc2VydmVyLCBvcHRpb25zKSB7XG4gICAgc3VwZXIob3B0aW9ucyB8fCB7fSk7XG5cbiAgICB0aGlzLl9zZXJ2ZXIgPSBzZXJ2ZXIgfHwgTWV0ZW9yLnNlcnZlcjtcbiAgICAvLyBTZXQgdXAgdGhlIHNlcnZlcidzIG1ldGhvZHMsIGFzIGlmIGJ5IGNhbGxpbmcgTWV0ZW9yLm1ldGhvZHMuXG4gICAgdGhpcy5faW5pdFNlcnZlck1ldGhvZHMoKTtcblxuICAgIHRoaXMuX2luaXRBY2NvdW50RGF0YUhvb2tzKCk7XG5cbiAgICAvLyBJZiBhdXRvcHVibGlzaCBpcyBvbiwgcHVibGlzaCB0aGVzZSB1c2VyIGZpZWxkcy4gTG9naW4gc2VydmljZVxuICAgIC8vIHBhY2thZ2VzIChlZyBhY2NvdW50cy1nb29nbGUpIGFkZCB0byB0aGVzZSBieSBjYWxsaW5nXG4gICAgLy8gYWRkQXV0b3B1Ymxpc2hGaWVsZHMuICBOb3RhYmx5LCB0aGlzIGlzbid0IGltcGxlbWVudGVkIHdpdGggbXVsdGlwbGVcbiAgICAvLyBwdWJsaXNoZXMgc2luY2UgRERQIG9ubHkgbWVyZ2VzIG9ubHkgYWNyb3NzIHRvcC1sZXZlbCBmaWVsZHMsIG5vdFxuICAgIC8vIHN1YmZpZWxkcyAoc3VjaCBhcyAnc2VydmljZXMuZmFjZWJvb2suYWNjZXNzVG9rZW4nKVxuICAgIHRoaXMuX2F1dG9wdWJsaXNoRmllbGRzID0ge1xuICAgICAgbG9nZ2VkSW5Vc2VyOiBbJ3Byb2ZpbGUnLCAndXNlcm5hbWUnLCAnZW1haWxzJ10sXG4gICAgICBvdGhlclVzZXJzOiBbJ3Byb2ZpbGUnLCAndXNlcm5hbWUnXVxuICAgIH07XG5cbiAgICAvLyB1c2Ugb2JqZWN0IHRvIGtlZXAgdGhlIHJlZmVyZW5jZSB3aGVuIHVzZWQgaW4gZnVuY3Rpb25zXG4gICAgLy8gd2hlcmUgX2RlZmF1bHRQdWJsaXNoRmllbGRzIGlzIGRlc3RydWN0dXJlZCBpbnRvIGxleGljYWwgc2NvcGVcbiAgICAvLyBmb3IgcHVibGlzaCBjYWxsYmFja3MgdGhhdCBuZWVkIGB0aGlzYFxuICAgIHRoaXMuX2RlZmF1bHRQdWJsaXNoRmllbGRzID0ge1xuICAgICAgcHJvamVjdGlvbjoge1xuICAgICAgICBwcm9maWxlOiAxLFxuICAgICAgICB1c2VybmFtZTogMSxcbiAgICAgICAgZW1haWxzOiAxLFxuICAgICAgfVxuICAgIH07XG5cbiAgICB0aGlzLl9pbml0U2VydmVyUHVibGljYXRpb25zKCk7XG5cbiAgICAvLyBjb25uZWN0aW9uSWQgLT4ge2Nvbm5lY3Rpb24sIGxvZ2luVG9rZW59XG4gICAgdGhpcy5fYWNjb3VudERhdGEgPSB7fTtcblxuICAgIC8vIGNvbm5lY3Rpb24gaWQgLT4gb2JzZXJ2ZSBoYW5kbGUgZm9yIHRoZSBsb2dpbiB0b2tlbiB0aGF0IHRoaXMgY29ubmVjdGlvbiBpc1xuICAgIC8vIGN1cnJlbnRseSBhc3NvY2lhdGVkIHdpdGgsIG9yIGEgbnVtYmVyLiBUaGUgbnVtYmVyIGluZGljYXRlcyB0aGF0IHdlIGFyZSBpblxuICAgIC8vIHRoZSBwcm9jZXNzIG9mIHNldHRpbmcgdXAgdGhlIG9ic2VydmUgKHVzaW5nIGEgbnVtYmVyIGluc3RlYWQgb2YgYSBzaW5nbGVcbiAgICAvLyBzZW50aW5lbCBhbGxvd3MgbXVsdGlwbGUgYXR0ZW1wdHMgdG8gc2V0IHVwIHRoZSBvYnNlcnZlIHRvIGlkZW50aWZ5IHdoaWNoXG4gICAgLy8gb25lIHdhcyB0aGVpcnMpLlxuICAgIHRoaXMuX3VzZXJPYnNlcnZlc0ZvckNvbm5lY3Rpb25zID0ge307XG4gICAgdGhpcy5fbmV4dFVzZXJPYnNlcnZlTnVtYmVyID0gMTsgIC8vIGZvciB0aGUgbnVtYmVyIGRlc2NyaWJlZCBhYm92ZS5cblxuICAgIC8vIGxpc3Qgb2YgYWxsIHJlZ2lzdGVyZWQgaGFuZGxlcnMuXG4gICAgdGhpcy5fbG9naW5IYW5kbGVycyA9IFtdO1xuXG4gICAgc2V0dXBVc2Vyc0NvbGxlY3Rpb24odGhpcy51c2Vycyk7XG4gICAgc2V0dXBEZWZhdWx0TG9naW5IYW5kbGVycyh0aGlzKTtcbiAgICBzZXRFeHBpcmVUb2tlbnNJbnRlcnZhbCh0aGlzKTtcblxuICAgIHRoaXMuX3ZhbGlkYXRlTG9naW5Ib29rID0gbmV3IEhvb2soeyBiaW5kRW52aXJvbm1lbnQ6IGZhbHNlIH0pO1xuICAgIHRoaXMuX3ZhbGlkYXRlTmV3VXNlckhvb2tzID0gW1xuICAgICAgZGVmYXVsdFZhbGlkYXRlTmV3VXNlckhvb2suYmluZCh0aGlzKVxuICAgIF07XG5cbiAgICB0aGlzLl9kZWxldGVTYXZlZFRva2Vuc0ZvckFsbFVzZXJzT25TdGFydHVwKCk7XG5cbiAgICB0aGlzLl9za2lwQ2FzZUluc2Vuc2l0aXZlQ2hlY2tzRm9yVGVzdCA9IHt9O1xuXG4gICAgdGhpcy51cmxzID0ge1xuICAgICAgcmVzZXRQYXNzd29yZDogKHRva2VuLCBleHRyYVBhcmFtcykgPT4gdGhpcy5idWlsZEVtYWlsVXJsKGAjL3Jlc2V0LXBhc3N3b3JkLyR7dG9rZW59YCwgZXh0cmFQYXJhbXMpLFxuICAgICAgdmVyaWZ5RW1haWw6ICh0b2tlbiwgZXh0cmFQYXJhbXMpID0+IHRoaXMuYnVpbGRFbWFpbFVybChgIy92ZXJpZnktZW1haWwvJHt0b2tlbn1gLCBleHRyYVBhcmFtcyksXG4gICAgICBsb2dpblRva2VuOiAoc2VsZWN0b3IsIHRva2VuLCBleHRyYVBhcmFtcykgPT5cbiAgICAgICAgdGhpcy5idWlsZEVtYWlsVXJsKGAvP2xvZ2luVG9rZW49JHt0b2tlbn0mc2VsZWN0b3I9JHtzZWxlY3Rvcn1gLCBleHRyYVBhcmFtcyksXG4gICAgICBlbnJvbGxBY2NvdW50OiAodG9rZW4sIGV4dHJhUGFyYW1zKSA9PiB0aGlzLmJ1aWxkRW1haWxVcmwoYCMvZW5yb2xsLWFjY291bnQvJHt0b2tlbn1gLCBleHRyYVBhcmFtcyksXG4gICAgfTtcblxuICAgIHRoaXMuYWRkRGVmYXVsdFJhdGVMaW1pdCgpO1xuXG4gICAgdGhpcy5idWlsZEVtYWlsVXJsID0gKHBhdGgsIGV4dHJhUGFyYW1zID0ge30pID0+IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwoTWV0ZW9yLmFic29sdXRlVXJsKHBhdGgpKTtcbiAgICAgIGNvbnN0IHBhcmFtcyA9IE9iamVjdC5lbnRyaWVzKGV4dHJhUGFyYW1zKTtcbiAgICAgIGlmIChwYXJhbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBBZGQgYWRkaXRpb25hbCBwYXJhbWV0ZXJzIHRvIHRoZSB1cmxcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgcGFyYW1zKSB7XG4gICAgICAgICAgdXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoa2V5LCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB1cmwudG9TdHJpbmcoKTtcbiAgICB9O1xuICB9XG5cbiAgLy8vXG4gIC8vLyBDVVJSRU5UIFVTRVJcbiAgLy8vXG5cbiAgLy8gQG92ZXJyaWRlIG9mIFwiYWJzdHJhY3RcIiBub24taW1wbGVtZW50YXRpb24gaW4gYWNjb3VudHNfY29tbW9uLmpzXG4gIHVzZXJJZCgpIHtcbiAgICAvLyBUaGlzIGZ1bmN0aW9uIG9ubHkgd29ya3MgaWYgY2FsbGVkIGluc2lkZSBhIG1ldGhvZCBvciBhIHB1YmljYXRpb24uXG4gICAgLy8gVXNpbmcgYW55IG9mIHRoZSBpbmZvcm1hdGlvbiBmcm9tIE1ldGVvci51c2VyKCkgaW4gYSBtZXRob2Qgb3JcbiAgICAvLyBwdWJsaXNoIGZ1bmN0aW9uIHdpbGwgYWx3YXlzIHVzZSB0aGUgdmFsdWUgZnJvbSB3aGVuIHRoZSBmdW5jdGlvbiBmaXJzdFxuICAgIC8vIHJ1bnMuIFRoaXMgaXMgbGlrZWx5IG5vdCB3aGF0IHRoZSB1c2VyIGV4cGVjdHMuIFRoZSB3YXkgdG8gbWFrZSB0aGlzIHdvcmtcbiAgICAvLyBpbiBhIG1ldGhvZCBvciBwdWJsaXNoIGZ1bmN0aW9uIGlzIHRvIGRvIE1ldGVvci5maW5kKHRoaXMudXNlcklkKS5vYnNlcnZlXG4gICAgLy8gYW5kIHJlY29tcHV0ZSB3aGVuIHRoZSB1c2VyIHJlY29yZCBjaGFuZ2VzLlxuICAgIGNvbnN0IGN1cnJlbnRJbnZvY2F0aW9uID0gRERQLl9DdXJyZW50TWV0aG9kSW52b2NhdGlvbi5nZXQoKSB8fCBERFAuX0N1cnJlbnRQdWJsaWNhdGlvbkludm9jYXRpb24uZ2V0KCk7XG4gICAgaWYgKCFjdXJyZW50SW52b2NhdGlvbilcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIk1ldGVvci51c2VySWQgY2FuIG9ubHkgYmUgaW52b2tlZCBpbiBtZXRob2QgY2FsbHMgb3IgcHVibGljYXRpb25zLlwiKTtcbiAgICByZXR1cm4gY3VycmVudEludm9jYXRpb24udXNlcklkO1xuICB9XG5cbiAgLy8vXG4gIC8vLyBMT0dJTiBIT09LU1xuICAvLy9cblxuICAvKipcbiAgICogQHN1bW1hcnkgVmFsaWRhdGUgbG9naW4gYXR0ZW1wdHMuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBDYWxsZWQgd2hlbmV2ZXIgYSBsb2dpbiBpcyBhdHRlbXB0ZWQgKGVpdGhlciBzdWNjZXNzZnVsIG9yIHVuc3VjY2Vzc2Z1bCkuICBBIGxvZ2luIGNhbiBiZSBhYm9ydGVkIGJ5IHJldHVybmluZyBhIGZhbHN5IHZhbHVlIG9yIHRocm93aW5nIGFuIGV4Y2VwdGlvbi5cbiAgICovXG4gIHZhbGlkYXRlTG9naW5BdHRlbXB0KGZ1bmMpIHtcbiAgICAvLyBFeGNlcHRpb25zIGluc2lkZSB0aGUgaG9vayBjYWxsYmFjayBhcmUgcGFzc2VkIHVwIHRvIHVzLlxuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZUxvZ2luSG9vay5yZWdpc3RlcihmdW5jKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBTZXQgcmVzdHJpY3Rpb25zIG9uIG5ldyB1c2VyIGNyZWF0aW9uLlxuICAgKiBAbG9jdXMgU2VydmVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgQ2FsbGVkIHdoZW5ldmVyIGEgbmV3IHVzZXIgaXMgY3JlYXRlZC4gVGFrZXMgdGhlIG5ldyB1c2VyIG9iamVjdCwgYW5kIHJldHVybnMgdHJ1ZSB0byBhbGxvdyB0aGUgY3JlYXRpb24gb3IgZmFsc2UgdG8gYWJvcnQuXG4gICAqL1xuICB2YWxpZGF0ZU5ld1VzZXIoZnVuYykge1xuICAgIHRoaXMuX3ZhbGlkYXRlTmV3VXNlckhvb2tzLnB1c2goZnVuYyk7XG4gIH1cblxuICAvKipcbiAgICogQHN1bW1hcnkgVmFsaWRhdGUgbG9naW4gZnJvbSBleHRlcm5hbCBzZXJ2aWNlXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBDYWxsZWQgd2hlbmV2ZXIgbG9naW4vdXNlciBjcmVhdGlvbiBmcm9tIGV4dGVybmFsIHNlcnZpY2UgaXMgYXR0ZW1wdGVkLiBMb2dpbiBvciB1c2VyIGNyZWF0aW9uIGJhc2VkIG9uIHRoaXMgbG9naW4gY2FuIGJlIGFib3J0ZWQgYnkgcGFzc2luZyBhIGZhbHN5IHZhbHVlIG9yIHRocm93aW5nIGFuIGV4Y2VwdGlvbi5cbiAgICovXG4gIGJlZm9yZUV4dGVybmFsTG9naW4oZnVuYykge1xuICAgIGlmICh0aGlzLl9iZWZvcmVFeHRlcm5hbExvZ2luSG9vaykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuIG9ubHkgY2FsbCBiZWZvcmVFeHRlcm5hbExvZ2luIG9uY2VcIik7XG4gICAgfVxuXG4gICAgdGhpcy5fYmVmb3JlRXh0ZXJuYWxMb2dpbkhvb2sgPSBmdW5jO1xuICB9XG5cbiAgLy8vXG4gIC8vLyBDUkVBVEUgVVNFUiBIT09LU1xuICAvLy9cblxuICAvKipcbiAgICogQHN1bW1hcnkgQ3VzdG9taXplIGxvZ2luIHRva2VuIGNyZWF0aW9uLlxuICAgKiBAbG9jdXMgU2VydmVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgQ2FsbGVkIHdoZW5ldmVyIGEgbmV3IHRva2VuIGlzIGNyZWF0ZWQuXG4gICAqIFJldHVybiB0aGUgc2VxdWVuY2UgYW5kIHRoZSB1c2VyIG9iamVjdC4gUmV0dXJuIHRydWUgdG8ga2VlcCBzZW5kaW5nIHRoZSBkZWZhdWx0IGVtYWlsLCBvciBmYWxzZSB0byBvdmVycmlkZSB0aGUgYmVoYXZpb3IuXG4gICAqL1xuICBvbkNyZWF0ZUxvZ2luVG9rZW4gPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgaWYgKHRoaXMuX29uQ3JlYXRlTG9naW5Ub2tlbkhvb2spIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2FuIG9ubHkgY2FsbCBvbkNyZWF0ZUxvZ2luVG9rZW4gb25jZScpO1xuICAgIH1cblxuICAgIHRoaXMuX29uQ3JlYXRlTG9naW5Ub2tlbkhvb2sgPSBmdW5jO1xuICB9O1xuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBDdXN0b21pemUgbmV3IHVzZXIgY3JlYXRpb24uXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBDYWxsZWQgd2hlbmV2ZXIgYSBuZXcgdXNlciBpcyBjcmVhdGVkLiBSZXR1cm4gdGhlIG5ldyB1c2VyIG9iamVjdCwgb3IgdGhyb3cgYW4gYEVycm9yYCB0byBhYm9ydCB0aGUgY3JlYXRpb24uXG4gICAqL1xuICBvbkNyZWF0ZVVzZXIoZnVuYykge1xuICAgIGlmICh0aGlzLl9vbkNyZWF0ZVVzZXJIb29rKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4gb25seSBjYWxsIG9uQ3JlYXRlVXNlciBvbmNlXCIpO1xuICAgIH1cblxuICAgIHRoaXMuX29uQ3JlYXRlVXNlckhvb2sgPSBNZXRlb3Iud3JhcEZuKGZ1bmMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEN1c3RvbWl6ZSBvYXV0aCB1c2VyIHByb2ZpbGUgdXBkYXRlc1xuICAgKiBAbG9jdXMgU2VydmVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgQ2FsbGVkIHdoZW5ldmVyIGEgdXNlciBpcyBsb2dnZWQgaW4gdmlhIG9hdXRoLiBSZXR1cm4gdGhlIHByb2ZpbGUgb2JqZWN0IHRvIGJlIG1lcmdlZCwgb3IgdGhyb3cgYW4gYEVycm9yYCB0byBhYm9ydCB0aGUgY3JlYXRpb24uXG4gICAqL1xuICBvbkV4dGVybmFsTG9naW4oZnVuYykge1xuICAgIGlmICh0aGlzLl9vbkV4dGVybmFsTG9naW5Ib29rKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4gb25seSBjYWxsIG9uRXh0ZXJuYWxMb2dpbiBvbmNlXCIpO1xuICAgIH1cblxuICAgIHRoaXMuX29uRXh0ZXJuYWxMb2dpbkhvb2sgPSBmdW5jO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdW1tYXJ5IEN1c3RvbWl6ZSB1c2VyIHNlbGVjdGlvbiBvbiBleHRlcm5hbCBsb2dpbnNcbiAgICogQGxvY3VzIFNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIENhbGxlZCB3aGVuZXZlciBhIHVzZXIgaXMgbG9nZ2VkIGluIHZpYSBvYXV0aCBhbmQgYVxuICAgKiB1c2VyIGlzIG5vdCBmb3VuZCB3aXRoIHRoZSBzZXJ2aWNlIGlkLiBSZXR1cm4gdGhlIHVzZXIgb3IgdW5kZWZpbmVkLlxuICAgKi9cbiAgc2V0QWRkaXRpb25hbEZpbmRVc2VyT25FeHRlcm5hbExvZ2luKGZ1bmMpIHtcbiAgICBpZiAodGhpcy5fYWRkaXRpb25hbEZpbmRVc2VyT25FeHRlcm5hbExvZ2luKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4gb25seSBjYWxsIHNldEFkZGl0aW9uYWxGaW5kVXNlck9uRXh0ZXJuYWxMb2dpbiBvbmNlXCIpO1xuICAgIH1cbiAgICB0aGlzLl9hZGRpdGlvbmFsRmluZFVzZXJPbkV4dGVybmFsTG9naW4gPSBmdW5jO1xuICB9XG5cbiAgX3ZhbGlkYXRlTG9naW4oY29ubmVjdGlvbiwgYXR0ZW1wdCkge1xuICAgIHRoaXMuX3ZhbGlkYXRlTG9naW5Ib29rLmZvckVhY2goY2FsbGJhY2sgPT4ge1xuICAgICAgbGV0IHJldDtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldCA9IGNhbGxiYWNrKGNsb25lQXR0ZW1wdFdpdGhDb25uZWN0aW9uKGNvbm5lY3Rpb24sIGF0dGVtcHQpKTtcbiAgICAgIH1cbiAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgIGF0dGVtcHQuYWxsb3dlZCA9IGZhbHNlO1xuICAgICAgICAvLyBYWFggdGhpcyBtZWFucyB0aGUgbGFzdCB0aHJvd24gZXJyb3Igb3ZlcnJpZGVzIHByZXZpb3VzIGVycm9yXG4gICAgICAgIC8vIG1lc3NhZ2VzLiBNYXliZSB0aGlzIGlzIHN1cnByaXNpbmcgdG8gdXNlcnMgYW5kIHdlIHNob3VsZCBtYWtlXG4gICAgICAgIC8vIG92ZXJyaWRpbmcgZXJyb3JzIG1vcmUgZXhwbGljaXQuIChzZWVcbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvaXNzdWVzLzE5NjApXG4gICAgICAgIGF0dGVtcHQuZXJyb3IgPSBlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGlmICghIHJldCkge1xuICAgICAgICBhdHRlbXB0LmFsbG93ZWQgPSBmYWxzZTtcbiAgICAgICAgLy8gZG9uJ3Qgb3ZlcnJpZGUgYSBzcGVjaWZpYyBlcnJvciBwcm92aWRlZCBieSBhIHByZXZpb3VzXG4gICAgICAgIC8vIHZhbGlkYXRvciBvciB0aGUgaW5pdGlhbCBhdHRlbXB0IChlZyBcImluY29ycmVjdCBwYXNzd29yZFwiKS5cbiAgICAgICAgaWYgKCFhdHRlbXB0LmVycm9yKVxuICAgICAgICAgIGF0dGVtcHQuZXJyb3IgPSBuZXcgTWV0ZW9yLkVycm9yKDQwMywgXCJMb2dpbiBmb3JiaWRkZW5cIik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgfTtcblxuICBfc3VjY2Vzc2Z1bExvZ2luKGNvbm5lY3Rpb24sIGF0dGVtcHQpIHtcbiAgICB0aGlzLl9vbkxvZ2luSG9vay5lYWNoKGNhbGxiYWNrID0+IHtcbiAgICAgIGNhbGxiYWNrKGNsb25lQXR0ZW1wdFdpdGhDb25uZWN0aW9uKGNvbm5lY3Rpb24sIGF0dGVtcHQpKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuICB9O1xuXG4gIF9mYWlsZWRMb2dpbihjb25uZWN0aW9uLCBhdHRlbXB0KSB7XG4gICAgdGhpcy5fb25Mb2dpbkZhaWx1cmVIb29rLmVhY2goY2FsbGJhY2sgPT4ge1xuICAgICAgY2FsbGJhY2soY2xvbmVBdHRlbXB0V2l0aENvbm5lY3Rpb24oY29ubmVjdGlvbiwgYXR0ZW1wdCkpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH07XG5cbiAgX3N1Y2Nlc3NmdWxMb2dvdXQoY29ubmVjdGlvbiwgdXNlcklkKSB7XG4gICAgLy8gZG9uJ3QgZmV0Y2ggdGhlIHVzZXIgb2JqZWN0IHVubGVzcyB0aGVyZSBhcmUgc29tZSBjYWxsYmFja3MgcmVnaXN0ZXJlZFxuICAgIGxldCB1c2VyO1xuICAgIHRoaXMuX29uTG9nb3V0SG9vay5lYWNoKGNhbGxiYWNrID0+IHtcbiAgICAgIGlmICghdXNlciAmJiB1c2VySWQpIHVzZXIgPSB0aGlzLnVzZXJzLmZpbmRPbmUodXNlcklkLCB7ZmllbGRzOiB0aGlzLl9vcHRpb25zLmRlZmF1bHRGaWVsZFNlbGVjdG9yfSk7XG4gICAgICBjYWxsYmFjayh7IHVzZXIsIGNvbm5lY3Rpb24gfSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBHZW5lcmF0ZXMgYSBNb25nb0RCIHNlbGVjdG9yIHRoYXQgY2FuIGJlIHVzZWQgdG8gcGVyZm9ybSBhIGZhc3QgY2FzZVxuICAvLyBpbnNlbnNpdGl2ZSBsb29rdXAgZm9yIHRoZSBnaXZlbiBmaWVsZE5hbWUgYW5kIHN0cmluZy4gU2luY2UgTW9uZ29EQiBkb2VzXG4gIC8vIG5vdCBzdXBwb3J0IGNhc2UgaW5zZW5zaXRpdmUgaW5kZXhlcywgYW5kIGNhc2UgaW5zZW5zaXRpdmUgcmVnZXggcXVlcmllc1xuICAvLyBhcmUgc2xvdywgd2UgY29uc3RydWN0IGEgc2V0IG9mIHByZWZpeCBzZWxlY3RvcnMgZm9yIGFsbCBwZXJtdXRhdGlvbnMgb2ZcbiAgLy8gdGhlIGZpcnN0IDQgY2hhcmFjdGVycyBvdXJzZWx2ZXMuIFdlIGZpcnN0IGF0dGVtcHQgdG8gbWF0Y2hpbmcgYWdhaW5zdFxuICAvLyB0aGVzZSwgYW5kIGJlY2F1c2UgJ3ByZWZpeCBleHByZXNzaW9uJyByZWdleCBxdWVyaWVzIGRvIHVzZSBpbmRleGVzIChzZWVcbiAgLy8gaHR0cDovL2RvY3MubW9uZ29kYi5vcmcvdjIuNi9yZWZlcmVuY2Uvb3BlcmF0b3IvcXVlcnkvcmVnZXgvI2luZGV4LXVzZSksXG4gIC8vIHRoaXMgaGFzIGJlZW4gZm91bmQgdG8gZ3JlYXRseSBpbXByb3ZlIHBlcmZvcm1hbmNlIChmcm9tIDEyMDBtcyB0byA1bXMgaW4gYVxuICAvLyB0ZXN0IHdpdGggMS4wMDAuMDAwIHVzZXJzKS5cbiAgX3NlbGVjdG9yRm9yRmFzdENhc2VJbnNlbnNpdGl2ZUxvb2t1cCA9IChmaWVsZE5hbWUsIHN0cmluZykgPT4ge1xuICAgIC8vIFBlcmZvcm1hbmNlIHNlZW1zIHRvIGltcHJvdmUgdXAgdG8gNCBwcmVmaXggY2hhcmFjdGVyc1xuICAgIGNvbnN0IHByZWZpeCA9IHN0cmluZy5zdWJzdHJpbmcoMCwgTWF0aC5taW4oc3RyaW5nLmxlbmd0aCwgNCkpO1xuICAgIGNvbnN0IG9yQ2xhdXNlID0gZ2VuZXJhdGVDYXNlUGVybXV0YXRpb25zRm9yU3RyaW5nKHByZWZpeCkubWFwKFxuICAgICAgICBwcmVmaXhQZXJtdXRhdGlvbiA9PiB7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0b3IgPSB7fTtcbiAgICAgICAgICBzZWxlY3RvcltmaWVsZE5hbWVdID1cbiAgICAgICAgICAgICAgbmV3IFJlZ0V4cChgXiR7TWV0ZW9yLl9lc2NhcGVSZWdFeHAocHJlZml4UGVybXV0YXRpb24pfWApO1xuICAgICAgICAgIHJldHVybiBzZWxlY3RvcjtcbiAgICAgICAgfSk7XG4gICAgY29uc3QgY2FzZUluc2Vuc2l0aXZlQ2xhdXNlID0ge307XG4gICAgY2FzZUluc2Vuc2l0aXZlQ2xhdXNlW2ZpZWxkTmFtZV0gPVxuICAgICAgICBuZXcgUmVnRXhwKGBeJHtNZXRlb3IuX2VzY2FwZVJlZ0V4cChzdHJpbmcpfSRgLCAnaScpXG4gICAgcmV0dXJuIHskYW5kOiBbeyRvcjogb3JDbGF1c2V9LCBjYXNlSW5zZW5zaXRpdmVDbGF1c2VdfTtcbiAgfVxuXG4gIF9maW5kVXNlckJ5UXVlcnkgPSAocXVlcnksIG9wdGlvbnMpID0+IHtcbiAgICBsZXQgdXNlciA9IG51bGw7XG5cbiAgICBpZiAocXVlcnkuaWQpIHtcbiAgICAgIC8vIGRlZmF1bHQgZmllbGQgc2VsZWN0b3IgaXMgYWRkZWQgd2l0aGluIGdldFVzZXJCeUlkKClcbiAgICAgIHVzZXIgPSBNZXRlb3IudXNlcnMuZmluZE9uZShxdWVyeS5pZCwgdGhpcy5fYWRkRGVmYXVsdEZpZWxkU2VsZWN0b3Iob3B0aW9ucykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvcHRpb25zID0gdGhpcy5fYWRkRGVmYXVsdEZpZWxkU2VsZWN0b3Iob3B0aW9ucyk7XG4gICAgICBsZXQgZmllbGROYW1lO1xuICAgICAgbGV0IGZpZWxkVmFsdWU7XG4gICAgICBpZiAocXVlcnkudXNlcm5hbWUpIHtcbiAgICAgICAgZmllbGROYW1lID0gJ3VzZXJuYW1lJztcbiAgICAgICAgZmllbGRWYWx1ZSA9IHF1ZXJ5LnVzZXJuYW1lO1xuICAgICAgfSBlbHNlIGlmIChxdWVyeS5lbWFpbCkge1xuICAgICAgICBmaWVsZE5hbWUgPSAnZW1haWxzLmFkZHJlc3MnO1xuICAgICAgICBmaWVsZFZhbHVlID0gcXVlcnkuZW1haWw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJzaG91bGRuJ3QgaGFwcGVuICh2YWxpZGF0aW9uIG1pc3NlZCBzb21ldGhpbmcpXCIpO1xuICAgICAgfVxuICAgICAgbGV0IHNlbGVjdG9yID0ge307XG4gICAgICBzZWxlY3RvcltmaWVsZE5hbWVdID0gZmllbGRWYWx1ZTtcbiAgICAgIHVzZXIgPSBNZXRlb3IudXNlcnMuZmluZE9uZShzZWxlY3Rvciwgb3B0aW9ucyk7XG4gICAgICAvLyBJZiB1c2VyIGlzIG5vdCBmb3VuZCwgdHJ5IGEgY2FzZSBpbnNlbnNpdGl2ZSBsb29rdXBcbiAgICAgIGlmICghdXNlcikge1xuICAgICAgICBzZWxlY3RvciA9IHRoaXMuX3NlbGVjdG9yRm9yRmFzdENhc2VJbnNlbnNpdGl2ZUxvb2t1cChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBjb25zdCBjYW5kaWRhdGVVc2VycyA9IE1ldGVvci51c2Vycy5maW5kKHNlbGVjdG9yLCB7IC4uLm9wdGlvbnMsIGxpbWl0OiAyIH0pLmZldGNoKCk7XG4gICAgICAgIC8vIE5vIG1hdGNoIGlmIG11bHRpcGxlIGNhbmRpZGF0ZXMgYXJlIGZvdW5kXG4gICAgICAgIGlmIChjYW5kaWRhdGVVc2Vycy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICB1c2VyID0gY2FuZGlkYXRlVXNlcnNbMF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdXNlcjtcbiAgfVxuXG4gIC8vL1xuICAvLy8gTE9HSU4gTUVUSE9EU1xuICAvLy9cblxuICAvLyBMb2dpbiBtZXRob2RzIHJldHVybiB0byB0aGUgY2xpZW50IGFuIG9iamVjdCBjb250YWluaW5nIHRoZXNlXG4gIC8vIGZpZWxkcyB3aGVuIHRoZSB1c2VyIHdhcyBsb2dnZWQgaW4gc3VjY2Vzc2Z1bGx5OlxuICAvL1xuICAvLyAgIGlkOiB1c2VySWRcbiAgLy8gICB0b2tlbjogKlxuICAvLyAgIHRva2VuRXhwaXJlczogKlxuICAvL1xuICAvLyB0b2tlbkV4cGlyZXMgaXMgb3B0aW9uYWwgYW5kIGludGVuZHMgdG8gcHJvdmlkZSBhIGhpbnQgdG8gdGhlXG4gIC8vIGNsaWVudCBhcyB0byB3aGVuIHRoZSB0b2tlbiB3aWxsIGV4cGlyZS4gSWYgbm90IHByb3ZpZGVkLCB0aGVcbiAgLy8gY2xpZW50IHdpbGwgY2FsbCBBY2NvdW50cy5fdG9rZW5FeHBpcmF0aW9uLCBwYXNzaW5nIGl0IHRoZSBkYXRlXG4gIC8vIHRoYXQgaXQgcmVjZWl2ZWQgdGhlIHRva2VuLlxuICAvL1xuICAvLyBUaGUgbG9naW4gbWV0aG9kIHdpbGwgdGhyb3cgYW4gZXJyb3IgYmFjayB0byB0aGUgY2xpZW50IGlmIHRoZSB1c2VyXG4gIC8vIGZhaWxlZCB0byBsb2cgaW4uXG4gIC8vXG4gIC8vXG4gIC8vIExvZ2luIGhhbmRsZXJzIGFuZCBzZXJ2aWNlIHNwZWNpZmljIGxvZ2luIG1ldGhvZHMgc3VjaCBhc1xuICAvLyBgY3JlYXRlVXNlcmAgaW50ZXJuYWxseSByZXR1cm4gYSBgcmVzdWx0YCBvYmplY3QgY29udGFpbmluZyB0aGVzZVxuICAvLyBmaWVsZHM6XG4gIC8vXG4gIC8vICAgdHlwZTpcbiAgLy8gICAgIG9wdGlvbmFsIHN0cmluZzsgdGhlIHNlcnZpY2UgbmFtZSwgb3ZlcnJpZGVzIHRoZSBoYW5kbGVyXG4gIC8vICAgICBkZWZhdWx0IGlmIHByZXNlbnQuXG4gIC8vXG4gIC8vICAgZXJyb3I6XG4gIC8vICAgICBleGNlcHRpb247IGlmIHRoZSB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGxvZ2luLCB0aGUgcmVhc29uIHdoeS5cbiAgLy9cbiAgLy8gICB1c2VySWQ6XG4gIC8vICAgICBzdHJpbmc7IHRoZSB1c2VyIGlkIG9mIHRoZSB1c2VyIGF0dGVtcHRpbmcgdG8gbG9naW4gKGlmXG4gIC8vICAgICBrbm93biksIHJlcXVpcmVkIGZvciBhbiBhbGxvd2VkIGxvZ2luLlxuICAvL1xuICAvLyAgIG9wdGlvbnM6XG4gIC8vICAgICBvcHRpb25hbCBvYmplY3QgbWVyZ2VkIGludG8gdGhlIHJlc3VsdCByZXR1cm5lZCBieSB0aGUgbG9naW5cbiAgLy8gICAgIG1ldGhvZDsgdXNlZCBieSBIQU1LIGZyb20gU1JQLlxuICAvL1xuICAvLyAgIHN0YW1wZWRMb2dpblRva2VuOlxuICAvLyAgICAgb3B0aW9uYWwgb2JqZWN0IHdpdGggYHRva2VuYCBhbmQgYHdoZW5gIGluZGljYXRpbmcgdGhlIGxvZ2luXG4gIC8vICAgICB0b2tlbiBpcyBhbHJlYWR5IHByZXNlbnQgaW4gdGhlIGRhdGFiYXNlLCByZXR1cm5lZCBieSB0aGVcbiAgLy8gICAgIFwicmVzdW1lXCIgbG9naW4gaGFuZGxlci5cbiAgLy9cbiAgLy8gRm9yIGNvbnZlbmllbmNlLCBsb2dpbiBtZXRob2RzIGNhbiBhbHNvIHRocm93IGFuIGV4Y2VwdGlvbiwgd2hpY2hcbiAgLy8gaXMgY29udmVydGVkIGludG8gYW4ge2Vycm9yfSByZXN1bHQuICBIb3dldmVyLCBpZiB0aGUgaWQgb2YgdGhlXG4gIC8vIHVzZXIgYXR0ZW1wdGluZyB0aGUgbG9naW4gaXMga25vd24sIGEge3VzZXJJZCwgZXJyb3J9IHJlc3VsdCBzaG91bGRcbiAgLy8gYmUgcmV0dXJuZWQgaW5zdGVhZCBzaW5jZSB0aGUgdXNlciBpZCBpcyBub3QgY2FwdHVyZWQgd2hlbiBhblxuICAvLyBleGNlcHRpb24gaXMgdGhyb3duLlxuICAvL1xuICAvLyBUaGlzIGludGVybmFsIGByZXN1bHRgIG9iamVjdCBpcyBhdXRvbWF0aWNhbGx5IGNvbnZlcnRlZCBpbnRvIHRoZVxuICAvLyBwdWJsaWMge2lkLCB0b2tlbiwgdG9rZW5FeHBpcmVzfSBvYmplY3QgcmV0dXJuZWQgdG8gdGhlIGNsaWVudC5cblxuICAvLyBUcnkgYSBsb2dpbiBtZXRob2QsIGNvbnZlcnRpbmcgdGhyb3duIGV4Y2VwdGlvbnMgaW50byBhbiB7ZXJyb3J9XG4gIC8vIHJlc3VsdC4gIFRoZSBgdHlwZWAgYXJndW1lbnQgaXMgYSBkZWZhdWx0LCBpbnNlcnRlZCBpbnRvIHRoZSByZXN1bHRcbiAgLy8gb2JqZWN0IGlmIG5vdCBleHBsaWNpdGx5IHJldHVybmVkLlxuICAvL1xuICAvLyBMb2cgaW4gYSB1c2VyIG9uIGEgY29ubmVjdGlvbi5cbiAgLy9cbiAgLy8gV2UgdXNlIHRoZSBtZXRob2QgaW52b2NhdGlvbiB0byBzZXQgdGhlIHVzZXIgaWQgb24gdGhlIGNvbm5lY3Rpb24sXG4gIC8vIG5vdCB0aGUgY29ubmVjdGlvbiBvYmplY3QgZGlyZWN0bHkuIHNldFVzZXJJZCBpcyB0aWVkIHRvIG1ldGhvZHMgdG9cbiAgLy8gZW5mb3JjZSBjbGVhciBvcmRlcmluZyBvZiBtZXRob2QgYXBwbGljYXRpb24gKHVzaW5nIHdhaXQgbWV0aG9kcyBvblxuICAvLyB0aGUgY2xpZW50LCBhbmQgYSBubyBzZXRVc2VySWQgYWZ0ZXIgdW5ibG9jayByZXN0cmljdGlvbiBvbiB0aGVcbiAgLy8gc2VydmVyKVxuICAvL1xuICAvLyBUaGUgYHN0YW1wZWRMb2dpblRva2VuYCBwYXJhbWV0ZXIgaXMgb3B0aW9uYWwuICBXaGVuIHByZXNlbnQsIGl0XG4gIC8vIGluZGljYXRlcyB0aGF0IHRoZSBsb2dpbiB0b2tlbiBoYXMgYWxyZWFkeSBiZWVuIGluc2VydGVkIGludG8gdGhlXG4gIC8vIGRhdGFiYXNlIGFuZCBkb2Vzbid0IG5lZWQgdG8gYmUgaW5zZXJ0ZWQgYWdhaW4uICAoSXQncyB1c2VkIGJ5IHRoZVxuICAvLyBcInJlc3VtZVwiIGxvZ2luIGhhbmRsZXIpLlxuICBfbG9naW5Vc2VyKG1ldGhvZEludm9jYXRpb24sIHVzZXJJZCwgc3RhbXBlZExvZ2luVG9rZW4pIHtcbiAgICBpZiAoISBzdGFtcGVkTG9naW5Ub2tlbikge1xuICAgICAgc3RhbXBlZExvZ2luVG9rZW4gPSB0aGlzLl9nZW5lcmF0ZVN0YW1wZWRMb2dpblRva2VuKCk7XG4gICAgICB0aGlzLl9pbnNlcnRMb2dpblRva2VuKHVzZXJJZCwgc3RhbXBlZExvZ2luVG9rZW4pO1xuICAgIH1cblxuICAgIC8vIFRoaXMgb3JkZXIgKGFuZCB0aGUgYXZvaWRhbmNlIG9mIHlpZWxkcykgaXMgaW1wb3J0YW50IHRvIG1ha2VcbiAgICAvLyBzdXJlIHRoYXQgd2hlbiBwdWJsaXNoIGZ1bmN0aW9ucyBhcmUgcmVydW4sIHRoZXkgc2VlIGFcbiAgICAvLyBjb25zaXN0ZW50IHZpZXcgb2YgdGhlIHdvcmxkOiB0aGUgdXNlcklkIGlzIHNldCBhbmQgbWF0Y2hlc1xuICAgIC8vIHRoZSBsb2dpbiB0b2tlbiBvbiB0aGUgY29ubmVjdGlvbiAobm90IHRoYXQgdGhlcmUgaXNcbiAgICAvLyBjdXJyZW50bHkgYSBwdWJsaWMgQVBJIGZvciByZWFkaW5nIHRoZSBsb2dpbiB0b2tlbiBvbiBhXG4gICAgLy8gY29ubmVjdGlvbikuXG4gICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoKCkgPT5cbiAgICAgIHRoaXMuX3NldExvZ2luVG9rZW4oXG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgbWV0aG9kSW52b2NhdGlvbi5jb25uZWN0aW9uLFxuICAgICAgICB0aGlzLl9oYXNoTG9naW5Ub2tlbihzdGFtcGVkTG9naW5Ub2tlbi50b2tlbilcbiAgICAgIClcbiAgICApO1xuXG4gICAgbWV0aG9kSW52b2NhdGlvbi5zZXRVc2VySWQodXNlcklkKTtcblxuICAgIHJldHVybiB7XG4gICAgICBpZDogdXNlcklkLFxuICAgICAgdG9rZW46IHN0YW1wZWRMb2dpblRva2VuLnRva2VuLFxuICAgICAgdG9rZW5FeHBpcmVzOiB0aGlzLl90b2tlbkV4cGlyYXRpb24oc3RhbXBlZExvZ2luVG9rZW4ud2hlbilcbiAgICB9O1xuICB9O1xuXG4gIC8vIEFmdGVyIGEgbG9naW4gbWV0aG9kIGhhcyBjb21wbGV0ZWQsIGNhbGwgdGhlIGxvZ2luIGhvb2tzLiAgTm90ZVxuICAvLyB0aGF0IGBhdHRlbXB0TG9naW5gIGlzIGNhbGxlZCBmb3IgKmFsbCogbG9naW4gYXR0ZW1wdHMsIGV2ZW4gb25lc1xuICAvLyB3aGljaCBhcmVuJ3Qgc3VjY2Vzc2Z1bCAoc3VjaCBhcyBhbiBpbnZhbGlkIHBhc3N3b3JkLCBldGMpLlxuICAvL1xuICAvLyBJZiB0aGUgbG9naW4gaXMgYWxsb3dlZCBhbmQgaXNuJ3QgYWJvcnRlZCBieSBhIHZhbGlkYXRlIGxvZ2luIGhvb2tcbiAgLy8gY2FsbGJhY2ssIGxvZyBpbiB0aGUgdXNlci5cbiAgLy9cbiAgYXN5bmMgX2F0dGVtcHRMb2dpbihcbiAgICBtZXRob2RJbnZvY2F0aW9uLFxuICAgIG1ldGhvZE5hbWUsXG4gICAgbWV0aG9kQXJncyxcbiAgICByZXN1bHRcbiAgKSB7XG4gICAgaWYgKCFyZXN1bHQpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJyZXN1bHQgaXMgcmVxdWlyZWRcIik7XG5cbiAgICAvLyBYWFggQSBwcm9ncmFtbWluZyBlcnJvciBpbiBhIGxvZ2luIGhhbmRsZXIgY2FuIGxlYWQgdG8gdGhpcyBvY2N1cnJpbmcsIGFuZFxuICAgIC8vIHRoZW4gd2UgZG9uJ3QgY2FsbCBvbkxvZ2luIG9yIG9uTG9naW5GYWlsdXJlIGNhbGxiYWNrcy4gU2hvdWxkXG4gICAgLy8gdHJ5TG9naW5NZXRob2QgY2F0Y2ggdGhpcyBjYXNlIGFuZCB0dXJuIGl0IGludG8gYW4gZXJyb3I/XG4gICAgaWYgKCFyZXN1bHQudXNlcklkICYmICFyZXN1bHQuZXJyb3IpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBIGxvZ2luIG1ldGhvZCBtdXN0IHNwZWNpZnkgYSB1c2VySWQgb3IgYW4gZXJyb3JcIik7XG5cbiAgICBsZXQgdXNlcjtcbiAgICBpZiAocmVzdWx0LnVzZXJJZClcbiAgICAgIHVzZXIgPSB0aGlzLnVzZXJzLmZpbmRPbmUocmVzdWx0LnVzZXJJZCwge2ZpZWxkczogdGhpcy5fb3B0aW9ucy5kZWZhdWx0RmllbGRTZWxlY3Rvcn0pO1xuXG4gICAgY29uc3QgYXR0ZW1wdCA9IHtcbiAgICAgIHR5cGU6IHJlc3VsdC50eXBlIHx8IFwidW5rbm93blwiLFxuICAgICAgYWxsb3dlZDogISEgKHJlc3VsdC51c2VySWQgJiYgIXJlc3VsdC5lcnJvciksXG4gICAgICBtZXRob2ROYW1lOiBtZXRob2ROYW1lLFxuICAgICAgbWV0aG9kQXJndW1lbnRzOiBBcnJheS5mcm9tKG1ldGhvZEFyZ3MpXG4gICAgfTtcbiAgICBpZiAocmVzdWx0LmVycm9yKSB7XG4gICAgICBhdHRlbXB0LmVycm9yID0gcmVzdWx0LmVycm9yO1xuICAgIH1cbiAgICBpZiAodXNlcikge1xuICAgICAgYXR0ZW1wdC51c2VyID0gdXNlcjtcbiAgICB9XG5cbiAgICAvLyBfdmFsaWRhdGVMb2dpbiBtYXkgbXV0YXRlIGBhdHRlbXB0YCBieSBhZGRpbmcgYW4gZXJyb3IgYW5kIGNoYW5naW5nIGFsbG93ZWRcbiAgICAvLyB0byBmYWxzZSwgYnV0IHRoYXQncyB0aGUgb25seSBjaGFuZ2UgaXQgY2FuIG1ha2UgKGFuZCB0aGUgdXNlcidzIGNhbGxiYWNrc1xuICAgIC8vIG9ubHkgZ2V0IGEgY2xvbmUgb2YgYGF0dGVtcHRgKS5cbiAgICB0aGlzLl92YWxpZGF0ZUxvZ2luKG1ldGhvZEludm9jYXRpb24uY29ubmVjdGlvbiwgYXR0ZW1wdCk7XG5cbiAgICBpZiAoYXR0ZW1wdC5hbGxvd2VkKSB7XG4gICAgICBjb25zdCByZXQgPSB7XG4gICAgICAgIC4uLnRoaXMuX2xvZ2luVXNlcihcbiAgICAgICAgICBtZXRob2RJbnZvY2F0aW9uLFxuICAgICAgICAgIHJlc3VsdC51c2VySWQsXG4gICAgICAgICAgcmVzdWx0LnN0YW1wZWRMb2dpblRva2VuXG4gICAgICAgICksXG4gICAgICAgIC4uLnJlc3VsdC5vcHRpb25zXG4gICAgICB9O1xuICAgICAgcmV0LnR5cGUgPSBhdHRlbXB0LnR5cGU7XG4gICAgICB0aGlzLl9zdWNjZXNzZnVsTG9naW4obWV0aG9kSW52b2NhdGlvbi5jb25uZWN0aW9uLCBhdHRlbXB0KTtcbiAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhpcy5fZmFpbGVkTG9naW4obWV0aG9kSW52b2NhdGlvbi5jb25uZWN0aW9uLCBhdHRlbXB0KTtcbiAgICAgIHRocm93IGF0dGVtcHQuZXJyb3I7XG4gICAgfVxuICB9O1xuXG4gIC8vIEFsbCBzZXJ2aWNlIHNwZWNpZmljIGxvZ2luIG1ldGhvZHMgc2hvdWxkIGdvIHRocm91Z2ggdGhpcyBmdW5jdGlvbi5cbiAgLy8gRW5zdXJlIHRoYXQgdGhyb3duIGV4Y2VwdGlvbnMgYXJlIGNhdWdodCBhbmQgdGhhdCBsb2dpbiBob29rXG4gIC8vIGNhbGxiYWNrcyBhcmUgc3RpbGwgY2FsbGVkLlxuICAvL1xuICBhc3luYyBfbG9naW5NZXRob2QoXG4gICAgbWV0aG9kSW52b2NhdGlvbixcbiAgICBtZXRob2ROYW1lLFxuICAgIG1ldGhvZEFyZ3MsXG4gICAgdHlwZSxcbiAgICBmblxuICApIHtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5fYXR0ZW1wdExvZ2luKFxuICAgICAgbWV0aG9kSW52b2NhdGlvbixcbiAgICAgIG1ldGhvZE5hbWUsXG4gICAgICBtZXRob2RBcmdzLFxuICAgICAgYXdhaXQgdHJ5TG9naW5NZXRob2QodHlwZSwgZm4pXG4gICAgKTtcbiAgfTtcblxuXG4gIC8vIFJlcG9ydCBhIGxvZ2luIGF0dGVtcHQgZmFpbGVkIG91dHNpZGUgdGhlIGNvbnRleHQgb2YgYSBub3JtYWwgbG9naW5cbiAgLy8gbWV0aG9kLiBUaGlzIGlzIGZvciB1c2UgaW4gdGhlIGNhc2Ugd2hlcmUgdGhlcmUgaXMgYSBtdWx0aS1zdGVwIGxvZ2luXG4gIC8vIHByb2NlZHVyZSAoZWcgU1JQIGJhc2VkIHBhc3N3b3JkIGxvZ2luKS4gSWYgYSBtZXRob2QgZWFybHkgaW4gdGhlXG4gIC8vIGNoYWluIGZhaWxzLCBpdCBzaG91bGQgY2FsbCB0aGlzIGZ1bmN0aW9uIHRvIHJlcG9ydCBhIGZhaWx1cmUuIFRoZXJlXG4gIC8vIGlzIG5vIGNvcnJlc3BvbmRpbmcgbWV0aG9kIGZvciBhIHN1Y2Nlc3NmdWwgbG9naW47IG1ldGhvZHMgdGhhdCBjYW5cbiAgLy8gc3VjY2VlZCBhdCBsb2dnaW5nIGEgdXNlciBpbiBzaG91bGQgYWx3YXlzIGJlIGFjdHVhbCBsb2dpbiBtZXRob2RzXG4gIC8vICh1c2luZyBlaXRoZXIgQWNjb3VudHMuX2xvZ2luTWV0aG9kIG9yIEFjY291bnRzLnJlZ2lzdGVyTG9naW5IYW5kbGVyKS5cbiAgX3JlcG9ydExvZ2luRmFpbHVyZShcbiAgICBtZXRob2RJbnZvY2F0aW9uLFxuICAgIG1ldGhvZE5hbWUsXG4gICAgbWV0aG9kQXJncyxcbiAgICByZXN1bHRcbiAgKSB7XG4gICAgY29uc3QgYXR0ZW1wdCA9IHtcbiAgICAgIHR5cGU6IHJlc3VsdC50eXBlIHx8IFwidW5rbm93blwiLFxuICAgICAgYWxsb3dlZDogZmFsc2UsXG4gICAgICBlcnJvcjogcmVzdWx0LmVycm9yLFxuICAgICAgbWV0aG9kTmFtZTogbWV0aG9kTmFtZSxcbiAgICAgIG1ldGhvZEFyZ3VtZW50czogQXJyYXkuZnJvbShtZXRob2RBcmdzKVxuICAgIH07XG5cbiAgICBpZiAocmVzdWx0LnVzZXJJZCkge1xuICAgICAgYXR0ZW1wdC51c2VyID0gdGhpcy51c2Vycy5maW5kT25lKHJlc3VsdC51c2VySWQsIHtmaWVsZHM6IHRoaXMuX29wdGlvbnMuZGVmYXVsdEZpZWxkU2VsZWN0b3J9KTtcbiAgICB9XG5cbiAgICB0aGlzLl92YWxpZGF0ZUxvZ2luKG1ldGhvZEludm9jYXRpb24uY29ubmVjdGlvbiwgYXR0ZW1wdCk7XG4gICAgdGhpcy5fZmFpbGVkTG9naW4obWV0aG9kSW52b2NhdGlvbi5jb25uZWN0aW9uLCBhdHRlbXB0KTtcblxuICAgIC8vIF92YWxpZGF0ZUxvZ2luIG1heSBtdXRhdGUgYXR0ZW1wdCB0byBzZXQgYSBuZXcgZXJyb3IgbWVzc2FnZS4gUmV0dXJuXG4gICAgLy8gdGhlIG1vZGlmaWVkIHZlcnNpb24uXG4gICAgcmV0dXJuIGF0dGVtcHQ7XG4gIH07XG5cbiAgLy8vXG4gIC8vLyBMT0dJTiBIQU5ETEVSU1xuICAvLy9cblxuICAvKipcbiAgICogQHN1bW1hcnkgUmVnaXN0ZXJzIGEgbmV3IGxvZ2luIGhhbmRsZXIuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQHBhcmFtIHtTdHJpbmd9IFtuYW1lXSBUaGUgdHlwZSBvZiBsb2dpbiBtZXRob2QgbGlrZSBvYXV0aCwgcGFzc3dvcmQsIGV0Yy5cbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gaGFuZGxlciBBIGZ1bmN0aW9uIHRoYXQgcmVjZWl2ZXMgYW4gb3B0aW9ucyBvYmplY3RcbiAgICogKGFzIHBhc3NlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgYGxvZ2luYCBtZXRob2QpIGFuZCByZXR1cm5zIG9uZSBvZlxuICAgKiBgdW5kZWZpbmVkYCwgbWVhbmluZyBkb24ndCBoYW5kbGUgb3IgYSBsb2dpbiBtZXRob2QgcmVzdWx0IG9iamVjdC5cbiAgICovXG4gIHJlZ2lzdGVyTG9naW5IYW5kbGVyKG5hbWUsIGhhbmRsZXIpIHtcbiAgICBpZiAoISBoYW5kbGVyKSB7XG4gICAgICBoYW5kbGVyID0gbmFtZTtcbiAgICAgIG5hbWUgPSBudWxsO1xuICAgIH1cblxuICAgIHRoaXMuX2xvZ2luSGFuZGxlcnMucHVzaCh7XG4gICAgICBuYW1lOiBuYW1lLFxuICAgICAgaGFuZGxlcjogTWV0ZW9yLndyYXBGbihoYW5kbGVyKVxuICAgIH0pO1xuICB9O1xuXG5cbiAgLy8gQ2hlY2tzIGEgdXNlcidzIGNyZWRlbnRpYWxzIGFnYWluc3QgYWxsIHRoZSByZWdpc3RlcmVkIGxvZ2luXG4gIC8vIGhhbmRsZXJzLCBhbmQgcmV0dXJucyBhIGxvZ2luIHRva2VuIGlmIHRoZSBjcmVkZW50aWFscyBhcmUgdmFsaWQuIEl0XG4gIC8vIGlzIGxpa2UgdGhlIGxvZ2luIG1ldGhvZCwgZXhjZXB0IHRoYXQgaXQgZG9lc24ndCBzZXQgdGhlIGxvZ2dlZC1pblxuICAvLyB1c2VyIG9uIHRoZSBjb25uZWN0aW9uLiBUaHJvd3MgYSBNZXRlb3IuRXJyb3IgaWYgbG9nZ2luZyBpbiBmYWlscyxcbiAgLy8gaW5jbHVkaW5nIHRoZSBjYXNlIHdoZXJlIG5vbmUgb2YgdGhlIGxvZ2luIGhhbmRsZXJzIGhhbmRsZWQgdGhlIGxvZ2luXG4gIC8vIHJlcXVlc3QuIE90aGVyd2lzZSwgcmV0dXJucyB7aWQ6IHVzZXJJZCwgdG9rZW46ICosIHRva2VuRXhwaXJlczogKn0uXG4gIC8vXG4gIC8vIEZvciBleGFtcGxlLCBpZiB5b3Ugd2FudCB0byBsb2dpbiB3aXRoIGEgcGxhaW50ZXh0IHBhc3N3b3JkLCBgb3B0aW9uc2AgY291bGQgYmVcbiAgLy8gICB7IHVzZXI6IHsgdXNlcm5hbWU6IDx1c2VybmFtZT4gfSwgcGFzc3dvcmQ6IDxwYXNzd29yZD4gfSwgb3JcbiAgLy8gICB7IHVzZXI6IHsgZW1haWw6IDxlbWFpbD4gfSwgcGFzc3dvcmQ6IDxwYXNzd29yZD4gfS5cblxuICAvLyBUcnkgYWxsIG9mIHRoZSByZWdpc3RlcmVkIGxvZ2luIGhhbmRsZXJzIHVudGlsIG9uZSBvZiB0aGVtIGRvZXNuJ3RcbiAgLy8gcmV0dXJuIGB1bmRlZmluZWRgLCBtZWFuaW5nIGl0IGhhbmRsZWQgdGhpcyBjYWxsIHRvIGBsb2dpbmAuIFJldHVyblxuICAvLyB0aGF0IHJldHVybiB2YWx1ZS5cbiAgYXN5bmMgX3J1bkxvZ2luSGFuZGxlcnMobWV0aG9kSW52b2NhdGlvbiwgb3B0aW9ucykge1xuICAgIGZvciAobGV0IGhhbmRsZXIgb2YgdGhpcy5fbG9naW5IYW5kbGVycykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdHJ5TG9naW5NZXRob2QoaGFuZGxlci5uYW1lLCBhc3luYyAoKSA9PlxuICAgICAgICBhd2FpdCBoYW5kbGVyLmhhbmRsZXIuY2FsbChtZXRob2RJbnZvY2F0aW9uLCBvcHRpb25zKVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcihcbiAgICAgICAgICA0MDAsXG4gICAgICAgICAgJ0EgbG9naW4gaGFuZGxlciBzaG91bGQgcmV0dXJuIGEgcmVzdWx0IG9yIHVuZGVmaW5lZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogbnVsbCxcbiAgICAgIGVycm9yOiBuZXcgTWV0ZW9yLkVycm9yKDQwMCwgXCJVbnJlY29nbml6ZWQgb3B0aW9ucyBmb3IgbG9naW4gcmVxdWVzdFwiKVxuICAgIH07XG4gIH07XG5cbiAgLy8gRGVsZXRlcyB0aGUgZ2l2ZW4gbG9naW5Ub2tlbiBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy9cbiAgLy8gRm9yIG5ldy1zdHlsZSBoYXNoZWQgdG9rZW4sIHRoaXMgd2lsbCBjYXVzZSBhbGwgY29ubmVjdGlvbnNcbiAgLy8gYXNzb2NpYXRlZCB3aXRoIHRoZSB0b2tlbiB0byBiZSBjbG9zZWQuXG4gIC8vXG4gIC8vIEFueSBjb25uZWN0aW9ucyBhc3NvY2lhdGVkIHdpdGggb2xkLXN0eWxlIHVuaGFzaGVkIHRva2VucyB3aWxsIGJlXG4gIC8vIGluIHRoZSBwcm9jZXNzIG9mIGJlY29taW5nIGFzc29jaWF0ZWQgd2l0aCBoYXNoZWQgdG9rZW5zIGFuZCB0aGVuXG4gIC8vIHRoZXknbGwgZ2V0IGNsb3NlZC5cbiAgZGVzdHJveVRva2VuKHVzZXJJZCwgbG9naW5Ub2tlbikge1xuICAgIHRoaXMudXNlcnMudXBkYXRlKHVzZXJJZCwge1xuICAgICAgJHB1bGw6IHtcbiAgICAgICAgXCJzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnNcIjoge1xuICAgICAgICAgICRvcjogW1xuICAgICAgICAgICAgeyBoYXNoZWRUb2tlbjogbG9naW5Ub2tlbiB9LFxuICAgICAgICAgICAgeyB0b2tlbjogbG9naW5Ub2tlbiB9XG4gICAgICAgICAgXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG5cbiAgX2luaXRTZXJ2ZXJNZXRob2RzKCkge1xuICAgIC8vIFRoZSBtZXRob2RzIGNyZWF0ZWQgaW4gdGhpcyBmdW5jdGlvbiBuZWVkIHRvIGJlIGNyZWF0ZWQgaGVyZSBzbyB0aGF0XG4gICAgLy8gdGhpcyB2YXJpYWJsZSBpcyBhdmFpbGFibGUgaW4gdGhlaXIgc2NvcGUuXG4gICAgY29uc3QgYWNjb3VudHMgPSB0aGlzO1xuXG5cbiAgICAvLyBUaGlzIG9iamVjdCB3aWxsIGJlIHBvcHVsYXRlZCB3aXRoIG1ldGhvZHMgYW5kIHRoZW4gcGFzc2VkIHRvXG4gICAgLy8gYWNjb3VudHMuX3NlcnZlci5tZXRob2RzIGZ1cnRoZXIgYmVsb3cuXG4gICAgY29uc3QgbWV0aG9kcyA9IHt9O1xuXG4gICAgLy8gQHJldHVybnMge09iamVjdHxudWxsfVxuICAgIC8vICAgSWYgc3VjY2Vzc2Z1bCwgcmV0dXJucyB7dG9rZW46IHJlY29ubmVjdFRva2VuLCBpZDogdXNlcklkfVxuICAgIC8vICAgSWYgdW5zdWNjZXNzZnVsIChmb3IgZXhhbXBsZSwgaWYgdGhlIHVzZXIgY2xvc2VkIHRoZSBvYXV0aCBsb2dpbiBwb3B1cCksXG4gICAgLy8gICAgIHRocm93cyBhbiBlcnJvciBkZXNjcmliaW5nIHRoZSByZWFzb25cbiAgICBtZXRob2RzLmxvZ2luID0gYXN5bmMgZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIC8vIExvZ2luIGhhbmRsZXJzIHNob3VsZCByZWFsbHkgYWxzbyBjaGVjayB3aGF0ZXZlciBmaWVsZCB0aGV5IGxvb2sgYXQgaW5cbiAgICAgIC8vIG9wdGlvbnMsIGJ1dCB3ZSBkb24ndCBlbmZvcmNlIGl0LlxuICAgICAgY2hlY2sob3B0aW9ucywgT2JqZWN0KTtcblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYWNjb3VudHMuX3J1bkxvZ2luSGFuZGxlcnModGhpcywgb3B0aW9ucyk7XG4gICAgICAvL2NvbnNvbGUubG9nKHtyZXN1bHR9KTtcblxuICAgICAgcmV0dXJuIGF3YWl0IGFjY291bnRzLl9hdHRlbXB0TG9naW4odGhpcywgXCJsb2dpblwiLCBhcmd1bWVudHMsIHJlc3VsdCk7XG4gICAgfTtcblxuICAgIG1ldGhvZHMubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgY29uc3QgdG9rZW4gPSBhY2NvdW50cy5fZ2V0TG9naW5Ub2tlbih0aGlzLmNvbm5lY3Rpb24uaWQpO1xuICAgICAgYWNjb3VudHMuX3NldExvZ2luVG9rZW4odGhpcy51c2VySWQsIHRoaXMuY29ubmVjdGlvbiwgbnVsbCk7XG4gICAgICBpZiAodG9rZW4gJiYgdGhpcy51c2VySWQpIHtcbiAgICAgICAgYWNjb3VudHMuZGVzdHJveVRva2VuKHRoaXMudXNlcklkLCB0b2tlbik7XG4gICAgICB9XG4gICAgICBhY2NvdW50cy5fc3VjY2Vzc2Z1bExvZ291dCh0aGlzLmNvbm5lY3Rpb24sIHRoaXMudXNlcklkKTtcbiAgICAgIHRoaXMuc2V0VXNlcklkKG51bGwpO1xuICAgIH07XG5cbiAgICAvLyBHZW5lcmF0ZXMgYSBuZXcgbG9naW4gdG9rZW4gd2l0aCB0aGUgc2FtZSBleHBpcmF0aW9uIGFzIHRoZVxuICAgIC8vIGNvbm5lY3Rpb24ncyBjdXJyZW50IHRva2VuIGFuZCBzYXZlcyBpdCB0byB0aGUgZGF0YWJhc2UuIEFzc29jaWF0ZXNcbiAgICAvLyB0aGUgY29ubmVjdGlvbiB3aXRoIHRoaXMgbmV3IHRva2VuIGFuZCByZXR1cm5zIGl0LiBUaHJvd3MgYW4gZXJyb3JcbiAgICAvLyBpZiBjYWxsZWQgb24gYSBjb25uZWN0aW9uIHRoYXQgaXNuJ3QgbG9nZ2VkIGluLlxuICAgIC8vXG4gICAgLy8gQHJldHVybnMgT2JqZWN0XG4gICAgLy8gICBJZiBzdWNjZXNzZnVsLCByZXR1cm5zIHsgdG9rZW46IDxuZXcgdG9rZW4+LCBpZDogPHVzZXIgaWQ+LFxuICAgIC8vICAgdG9rZW5FeHBpcmVzOiA8ZXhwaXJhdGlvbiBkYXRlPiB9LlxuICAgIG1ldGhvZHMuZ2V0TmV3VG9rZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICBjb25zdCB1c2VyID0gYWNjb3VudHMudXNlcnMuZmluZE9uZSh0aGlzLnVzZXJJZCwge1xuICAgICAgICBmaWVsZHM6IHsgXCJzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnNcIjogMSB9XG4gICAgICB9KTtcbiAgICAgIGlmICghIHRoaXMudXNlcklkIHx8ICEgdXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKFwiWW91IGFyZSBub3QgbG9nZ2VkIGluLlwiKTtcbiAgICAgIH1cbiAgICAgIC8vIEJlIGNhcmVmdWwgbm90IHRvIGdlbmVyYXRlIGEgbmV3IHRva2VuIHRoYXQgaGFzIGEgbGF0ZXJcbiAgICAgIC8vIGV4cGlyYXRpb24gdGhhbiB0aGUgY3VycmVuIHRva2VuLiBPdGhlcndpc2UsIGEgYmFkIGd1eSB3aXRoIGFcbiAgICAgIC8vIHN0b2xlbiB0b2tlbiBjb3VsZCB1c2UgdGhpcyBtZXRob2QgdG8gc3RvcCBoaXMgc3RvbGVuIHRva2VuIGZyb21cbiAgICAgIC8vIGV2ZXIgZXhwaXJpbmcuXG4gICAgICBjb25zdCBjdXJyZW50SGFzaGVkVG9rZW4gPSBhY2NvdW50cy5fZ2V0TG9naW5Ub2tlbih0aGlzLmNvbm5lY3Rpb24uaWQpO1xuICAgICAgY29uc3QgY3VycmVudFN0YW1wZWRUb2tlbiA9IHVzZXIuc2VydmljZXMucmVzdW1lLmxvZ2luVG9rZW5zLmZpbmQoXG4gICAgICAgIHN0YW1wZWRUb2tlbiA9PiBzdGFtcGVkVG9rZW4uaGFzaGVkVG9rZW4gPT09IGN1cnJlbnRIYXNoZWRUb2tlblxuICAgICAgKTtcbiAgICAgIGlmICghIGN1cnJlbnRTdGFtcGVkVG9rZW4pIHsgLy8gc2FmZXR5IGJlbHQ6IHRoaXMgc2hvdWxkIG5ldmVyIGhhcHBlblxuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKFwiSW52YWxpZCBsb2dpbiB0b2tlblwiKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5ld1N0YW1wZWRUb2tlbiA9IGFjY291bnRzLl9nZW5lcmF0ZVN0YW1wZWRMb2dpblRva2VuKCk7XG4gICAgICBuZXdTdGFtcGVkVG9rZW4ud2hlbiA9IGN1cnJlbnRTdGFtcGVkVG9rZW4ud2hlbjtcbiAgICAgIGFjY291bnRzLl9pbnNlcnRMb2dpblRva2VuKHRoaXMudXNlcklkLCBuZXdTdGFtcGVkVG9rZW4pO1xuICAgICAgcmV0dXJuIGFjY291bnRzLl9sb2dpblVzZXIodGhpcywgdGhpcy51c2VySWQsIG5ld1N0YW1wZWRUb2tlbik7XG4gICAgfTtcblxuICAgIC8vIFJlbW92ZXMgYWxsIHRva2VucyBleGNlcHQgdGhlIHRva2VuIGFzc29jaWF0ZWQgd2l0aCB0aGUgY3VycmVudFxuICAgIC8vIGNvbm5lY3Rpb24uIFRocm93cyBhbiBlcnJvciBpZiB0aGUgY29ubmVjdGlvbiBpcyBub3QgbG9nZ2VkXG4gICAgLy8gaW4uIFJldHVybnMgbm90aGluZyBvbiBzdWNjZXNzLlxuICAgIG1ldGhvZHMucmVtb3ZlT3RoZXJUb2tlbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoISB0aGlzLnVzZXJJZCkge1xuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKFwiWW91IGFyZSBub3QgbG9nZ2VkIGluLlwiKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGN1cnJlbnRUb2tlbiA9IGFjY291bnRzLl9nZXRMb2dpblRva2VuKHRoaXMuY29ubmVjdGlvbi5pZCk7XG4gICAgICBhY2NvdW50cy51c2Vycy51cGRhdGUodGhpcy51c2VySWQsIHtcbiAgICAgICAgJHB1bGw6IHtcbiAgICAgICAgICBcInNlcnZpY2VzLnJlc3VtZS5sb2dpblRva2Vuc1wiOiB7IGhhc2hlZFRva2VuOiB7ICRuZTogY3VycmVudFRva2VuIH0gfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgLy8gQWxsb3cgYSBvbmUtdGltZSBjb25maWd1cmF0aW9uIGZvciBhIGxvZ2luIHNlcnZpY2UuIE1vZGlmaWNhdGlvbnNcbiAgICAvLyB0byB0aGlzIGNvbGxlY3Rpb24gYXJlIGFsc28gYWxsb3dlZCBpbiBpbnNlY3VyZSBtb2RlLlxuICAgIG1ldGhvZHMuY29uZmlndXJlTG9naW5TZXJ2aWNlID0gKG9wdGlvbnMpID0+IHtcbiAgICAgIGNoZWNrKG9wdGlvbnMsIE1hdGNoLk9iamVjdEluY2x1ZGluZyh7c2VydmljZTogU3RyaW5nfSkpO1xuICAgICAgLy8gRG9uJ3QgbGV0IHJhbmRvbSB1c2VycyBjb25maWd1cmUgYSBzZXJ2aWNlIHdlIGhhdmVuJ3QgYWRkZWQgeWV0IChzb1xuICAgICAgLy8gdGhhdCB3aGVuIHdlIGRvIGxhdGVyIGFkZCBpdCwgaXQncyBzZXQgdXAgd2l0aCB0aGVpciBjb25maWd1cmF0aW9uXG4gICAgICAvLyBpbnN0ZWFkIG9mIG91cnMpLlxuICAgICAgLy8gWFhYIGlmIHNlcnZpY2UgY29uZmlndXJhdGlvbiBpcyBvYXV0aC1zcGVjaWZpYyB0aGVuIHRoaXMgY29kZSBzaG91bGRcbiAgICAgIC8vICAgICBiZSBpbiBhY2NvdW50cy1vYXV0aDsgaWYgaXQncyBub3QgdGhlbiB0aGUgcmVnaXN0cnkgc2hvdWxkIGJlXG4gICAgICAvLyAgICAgaW4gdGhpcyBwYWNrYWdlXG4gICAgICBpZiAoIShhY2NvdW50cy5vYXV0aFxuICAgICAgICAmJiBhY2NvdW50cy5vYXV0aC5zZXJ2aWNlTmFtZXMoKS5pbmNsdWRlcyhvcHRpb25zLnNlcnZpY2UpKSkge1xuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKDQwMywgXCJTZXJ2aWNlIHVua25vd25cIik7XG4gICAgICB9XG5cbiAgICAgIGlmIChQYWNrYWdlWydzZXJ2aWNlLWNvbmZpZ3VyYXRpb24nXSkge1xuICAgICAgICBjb25zdCB7IFNlcnZpY2VDb25maWd1cmF0aW9uIH0gPSBQYWNrYWdlWydzZXJ2aWNlLWNvbmZpZ3VyYXRpb24nXTtcbiAgICAgICAgaWYgKFNlcnZpY2VDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25zLmZpbmRPbmUoe3NlcnZpY2U6IG9wdGlvbnMuc2VydmljZX0pKVxuICAgICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBgU2VydmljZSAke29wdGlvbnMuc2VydmljZX0gYWxyZWFkeSBjb25maWd1cmVkYCk7XG5cbiAgICAgICAgaWYgKFBhY2thZ2VbXCJvYXV0aC1lbmNyeXB0aW9uXCJdKSB7XG4gICAgICAgICAgY29uc3QgeyBPQXV0aEVuY3J5cHRpb24gfSA9IFBhY2thZ2VbXCJvYXV0aC1lbmNyeXB0aW9uXCJdXG4gICAgICAgICAgaWYgKGhhc093bi5jYWxsKG9wdGlvbnMsICdzZWNyZXQnKSAmJiBPQXV0aEVuY3J5cHRpb24ua2V5SXNMb2FkZWQoKSlcbiAgICAgICAgICAgIG9wdGlvbnMuc2VjcmV0ID0gT0F1dGhFbmNyeXB0aW9uLnNlYWwob3B0aW9ucy5zZWNyZXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgU2VydmljZUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbnMuaW5zZXJ0KG9wdGlvbnMpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBhY2NvdW50cy5fc2VydmVyLm1ldGhvZHMobWV0aG9kcyk7XG4gIH07XG5cbiAgX2luaXRBY2NvdW50RGF0YUhvb2tzKCkge1xuICAgIHRoaXMuX3NlcnZlci5vbkNvbm5lY3Rpb24oY29ubmVjdGlvbiA9PiB7XG4gICAgICB0aGlzLl9hY2NvdW50RGF0YVtjb25uZWN0aW9uLmlkXSA9IHtcbiAgICAgICAgY29ubmVjdGlvbjogY29ubmVjdGlvblxuICAgICAgfTtcblxuICAgICAgY29ubmVjdGlvbi5vbkNsb3NlKCgpID0+IHtcbiAgICAgICAgdGhpcy5fcmVtb3ZlVG9rZW5Gcm9tQ29ubmVjdGlvbihjb25uZWN0aW9uLmlkKTtcbiAgICAgICAgZGVsZXRlIHRoaXMuX2FjY291bnREYXRhW2Nvbm5lY3Rpb24uaWRdO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH07XG5cbiAgX2luaXRTZXJ2ZXJQdWJsaWNhdGlvbnMoKSB7XG4gICAgLy8gQnJpbmcgaW50byBsZXhpY2FsIHNjb3BlIGZvciBwdWJsaXNoIGNhbGxiYWNrcyB0aGF0IG5lZWQgYHRoaXNgXG4gICAgY29uc3QgeyB1c2VycywgX2F1dG9wdWJsaXNoRmllbGRzLCBfZGVmYXVsdFB1Ymxpc2hGaWVsZHMgfSA9IHRoaXM7XG5cbiAgICAvLyBQdWJsaXNoIGFsbCBsb2dpbiBzZXJ2aWNlIGNvbmZpZ3VyYXRpb24gZmllbGRzIG90aGVyIHRoYW4gc2VjcmV0LlxuICAgIHRoaXMuX3NlcnZlci5wdWJsaXNoKFwibWV0ZW9yLmxvZ2luU2VydmljZUNvbmZpZ3VyYXRpb25cIiwgZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoUGFja2FnZVsnc2VydmljZS1jb25maWd1cmF0aW9uJ10pIHtcbiAgICAgICAgY29uc3QgeyBTZXJ2aWNlQ29uZmlndXJhdGlvbiB9ID0gUGFja2FnZVsnc2VydmljZS1jb25maWd1cmF0aW9uJ107XG4gICAgICAgIHJldHVybiBTZXJ2aWNlQ29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9ucy5maW5kKHt9LCB7ZmllbGRzOiB7c2VjcmV0OiAwfX0pO1xuICAgICAgfVxuICAgICAgdGhpcy5yZWFkeSgpO1xuICAgIH0sIHtpc19hdXRvOiB0cnVlfSk7IC8vIG5vdCB0ZWNobmljYWxseSBhdXRvcHVibGlzaCwgYnV0IHN0b3BzIHRoZSB3YXJuaW5nLlxuXG4gICAgLy8gVXNlIE1ldGVvci5zdGFydHVwIHRvIGdpdmUgb3RoZXIgcGFja2FnZXMgYSBjaGFuY2UgdG8gY2FsbFxuICAgIC8vIHNldERlZmF1bHRQdWJsaXNoRmllbGRzLlxuICAgIE1ldGVvci5zdGFydHVwKCgpID0+IHtcbiAgICAgIC8vIE1lcmdlIGN1c3RvbSBmaWVsZHMgc2VsZWN0b3IgYW5kIGRlZmF1bHQgcHVibGlzaCBmaWVsZHMgc28gdGhhdCB0aGUgY2xpZW50XG4gICAgICAvLyBnZXRzIGFsbCB0aGUgbmVjZXNzYXJ5IGZpZWxkcyB0byBydW4gcHJvcGVybHlcbiAgICAgIGNvbnN0IGN1c3RvbUZpZWxkcyA9IHRoaXMuX2FkZERlZmF1bHRGaWVsZFNlbGVjdG9yKCkuZmllbGRzIHx8IHt9O1xuICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKGN1c3RvbUZpZWxkcyk7XG4gICAgICAvLyBJZiB0aGUgY3VzdG9tIGZpZWxkcyBhcmUgbmVnYXRpdmUsIHRoZW4gaWdub3JlIHRoZW0gYW5kIG9ubHkgc2VuZCB0aGUgbmVjZXNzYXJ5IGZpZWxkc1xuICAgICAgY29uc3QgZmllbGRzID0ga2V5cy5sZW5ndGggPiAwICYmIGN1c3RvbUZpZWxkc1trZXlzWzBdXSA/IHtcbiAgICAgICAgLi4udGhpcy5fYWRkRGVmYXVsdEZpZWxkU2VsZWN0b3IoKS5maWVsZHMsXG4gICAgICAgIC4uLl9kZWZhdWx0UHVibGlzaEZpZWxkcy5wcm9qZWN0aW9uXG4gICAgICB9IDogX2RlZmF1bHRQdWJsaXNoRmllbGRzLnByb2plY3Rpb25cbiAgICAgIC8vIFB1Ymxpc2ggdGhlIGN1cnJlbnQgdXNlcidzIHJlY29yZCB0byB0aGUgY2xpZW50LlxuICAgICAgdGhpcy5fc2VydmVyLnB1Ymxpc2gobnVsbCwgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy51c2VySWQpIHtcbiAgICAgICAgICByZXR1cm4gdXNlcnMuZmluZCh7XG4gICAgICAgICAgICBfaWQ6IHRoaXMudXNlcklkXG4gICAgICAgICAgfSwge1xuICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICB9LCAvKnN1cHByZXNzIGF1dG9wdWJsaXNoIHdhcm5pbmcqL3tpc19hdXRvOiB0cnVlfSk7XG4gICAgfSk7XG5cbiAgICAvLyBVc2UgTWV0ZW9yLnN0YXJ0dXAgdG8gZ2l2ZSBvdGhlciBwYWNrYWdlcyBhIGNoYW5jZSB0byBjYWxsXG4gICAgLy8gYWRkQXV0b3B1Ymxpc2hGaWVsZHMuXG4gICAgUGFja2FnZS5hdXRvcHVibGlzaCAmJiBNZXRlb3Iuc3RhcnR1cCgoKSA9PiB7XG4gICAgICAvLyBbJ3Byb2ZpbGUnLCAndXNlcm5hbWUnXSAtPiB7cHJvZmlsZTogMSwgdXNlcm5hbWU6IDF9XG4gICAgICBjb25zdCB0b0ZpZWxkU2VsZWN0b3IgPSBmaWVsZHMgPT4gZmllbGRzLnJlZHVjZSgocHJldiwgZmllbGQpID0+IChcbiAgICAgICAgICB7IC4uLnByZXYsIFtmaWVsZF06IDEgfSksXG4gICAgICAgIHt9XG4gICAgICApO1xuICAgICAgdGhpcy5fc2VydmVyLnB1Ymxpc2gobnVsbCwgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy51c2VySWQpIHtcbiAgICAgICAgICByZXR1cm4gdXNlcnMuZmluZCh7IF9pZDogdGhpcy51c2VySWQgfSwge1xuICAgICAgICAgICAgZmllbGRzOiB0b0ZpZWxkU2VsZWN0b3IoX2F1dG9wdWJsaXNoRmllbGRzLmxvZ2dlZEluVXNlciksXG4gICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfSwgLypzdXBwcmVzcyBhdXRvcHVibGlzaCB3YXJuaW5nKi97aXNfYXV0bzogdHJ1ZX0pO1xuXG4gICAgICAvLyBYWFggdGhpcyBwdWJsaXNoIGlzIG5laXRoZXIgZGVkdXAtYWJsZSBub3IgaXMgaXQgb3B0aW1pemVkIGJ5IG91ciBzcGVjaWFsXG4gICAgICAvLyB0cmVhdG1lbnQgb2YgcXVlcmllcyBvbiBhIHNwZWNpZmljIF9pZC4gVGhlcmVmb3JlIHRoaXMgd2lsbCBoYXZlIE8obl4yKVxuICAgICAgLy8gcnVuLXRpbWUgcGVyZm9ybWFuY2UgZXZlcnkgdGltZSBhIHVzZXIgZG9jdW1lbnQgaXMgY2hhbmdlZCAoZWcgc29tZW9uZVxuICAgICAgLy8gbG9nZ2luZyBpbikuIElmIHRoaXMgaXMgYSBwcm9ibGVtLCB3ZSBjYW4gaW5zdGVhZCB3cml0ZSBhIG1hbnVhbCBwdWJsaXNoXG4gICAgICAvLyBmdW5jdGlvbiB3aGljaCBmaWx0ZXJzIG91dCBmaWVsZHMgYmFzZWQgb24gJ3RoaXMudXNlcklkJy5cbiAgICAgIHRoaXMuX3NlcnZlci5wdWJsaXNoKG51bGwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY29uc3Qgc2VsZWN0b3IgPSB0aGlzLnVzZXJJZCA/IHsgX2lkOiB7ICRuZTogdGhpcy51c2VySWQgfSB9IDoge307XG4gICAgICAgIHJldHVybiB1c2Vycy5maW5kKHNlbGVjdG9yLCB7XG4gICAgICAgICAgZmllbGRzOiB0b0ZpZWxkU2VsZWN0b3IoX2F1dG9wdWJsaXNoRmllbGRzLm90aGVyVXNlcnMpLFxuICAgICAgICB9KVxuICAgICAgfSwgLypzdXBwcmVzcyBhdXRvcHVibGlzaCB3YXJuaW5nKi97aXNfYXV0bzogdHJ1ZX0pO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEFkZCB0byB0aGUgbGlzdCBvZiBmaWVsZHMgb3Igc3ViZmllbGRzIHRvIGJlIGF1dG9tYXRpY2FsbHlcbiAgLy8gcHVibGlzaGVkIGlmIGF1dG9wdWJsaXNoIGlzIG9uLiBNdXN0IGJlIGNhbGxlZCBmcm9tIHRvcC1sZXZlbFxuICAvLyBjb2RlIChpZSwgYmVmb3JlIE1ldGVvci5zdGFydHVwIGhvb2tzIHJ1bikuXG4gIC8vXG4gIC8vIEBwYXJhbSBvcHRzIHtPYmplY3R9IHdpdGg6XG4gIC8vICAgLSBmb3JMb2dnZWRJblVzZXIge0FycmF5fSBBcnJheSBvZiBmaWVsZHMgcHVibGlzaGVkIHRvIHRoZSBsb2dnZWQtaW4gdXNlclxuICAvLyAgIC0gZm9yT3RoZXJVc2VycyB7QXJyYXl9IEFycmF5IG9mIGZpZWxkcyBwdWJsaXNoZWQgdG8gdXNlcnMgdGhhdCBhcmVuJ3QgbG9nZ2VkIGluXG4gIGFkZEF1dG9wdWJsaXNoRmllbGRzKG9wdHMpIHtcbiAgICB0aGlzLl9hdXRvcHVibGlzaEZpZWxkcy5sb2dnZWRJblVzZXIucHVzaC5hcHBseShcbiAgICAgIHRoaXMuX2F1dG9wdWJsaXNoRmllbGRzLmxvZ2dlZEluVXNlciwgb3B0cy5mb3JMb2dnZWRJblVzZXIpO1xuICAgIHRoaXMuX2F1dG9wdWJsaXNoRmllbGRzLm90aGVyVXNlcnMucHVzaC5hcHBseShcbiAgICAgIHRoaXMuX2F1dG9wdWJsaXNoRmllbGRzLm90aGVyVXNlcnMsIG9wdHMuZm9yT3RoZXJVc2Vycyk7XG4gIH07XG5cbiAgLy8gUmVwbGFjZXMgdGhlIGZpZWxkcyB0byBiZSBhdXRvbWF0aWNhbGx5XG4gIC8vIHB1Ymxpc2hlZCB3aGVuIHRoZSB1c2VyIGxvZ3MgaW5cbiAgLy9cbiAgLy8gQHBhcmFtIHtNb25nb0ZpZWxkU3BlY2lmaWVyfSBmaWVsZHMgRGljdGlvbmFyeSBvZiBmaWVsZHMgdG8gcmV0dXJuIG9yIGV4Y2x1ZGUuXG4gIHNldERlZmF1bHRQdWJsaXNoRmllbGRzKGZpZWxkcykge1xuICAgIHRoaXMuX2RlZmF1bHRQdWJsaXNoRmllbGRzLnByb2plY3Rpb24gPSBmaWVsZHM7XG4gIH07XG5cbiAgLy8vXG4gIC8vLyBBQ0NPVU5UIERBVEFcbiAgLy8vXG5cbiAgLy8gSEFDSzogVGhpcyBpcyB1c2VkIGJ5ICdtZXRlb3ItYWNjb3VudHMnIHRvIGdldCB0aGUgbG9naW5Ub2tlbiBmb3IgYVxuICAvLyBjb25uZWN0aW9uLiBNYXliZSB0aGVyZSBzaG91bGQgYmUgYSBwdWJsaWMgd2F5IHRvIGRvIHRoYXQuXG4gIF9nZXRBY2NvdW50RGF0YShjb25uZWN0aW9uSWQsIGZpZWxkKSB7XG4gICAgY29uc3QgZGF0YSA9IHRoaXMuX2FjY291bnREYXRhW2Nvbm5lY3Rpb25JZF07XG4gICAgcmV0dXJuIGRhdGEgJiYgZGF0YVtmaWVsZF07XG4gIH07XG5cbiAgX3NldEFjY291bnREYXRhKGNvbm5lY3Rpb25JZCwgZmllbGQsIHZhbHVlKSB7XG4gICAgY29uc3QgZGF0YSA9IHRoaXMuX2FjY291bnREYXRhW2Nvbm5lY3Rpb25JZF07XG5cbiAgICAvLyBzYWZldHkgYmVsdC4gc2hvdWxkbid0IGhhcHBlbi4gYWNjb3VudERhdGEgaXMgc2V0IGluIG9uQ29ubmVjdGlvbixcbiAgICAvLyB3ZSBkb24ndCBoYXZlIGEgY29ubmVjdGlvbklkIHVudGlsIGl0IGlzIHNldC5cbiAgICBpZiAoIWRhdGEpXG4gICAgICByZXR1cm47XG5cbiAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZClcbiAgICAgIGRlbGV0ZSBkYXRhW2ZpZWxkXTtcbiAgICBlbHNlXG4gICAgICBkYXRhW2ZpZWxkXSA9IHZhbHVlO1xuICB9O1xuXG4gIC8vL1xuICAvLy8gUkVDT05ORUNUIFRPS0VOU1xuICAvLy9cbiAgLy8vIHN1cHBvcnQgcmVjb25uZWN0aW5nIHVzaW5nIGEgbWV0ZW9yIGxvZ2luIHRva2VuXG5cbiAgX2hhc2hMb2dpblRva2VuKGxvZ2luVG9rZW4pIHtcbiAgICBjb25zdCBoYXNoID0gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTI1NicpO1xuICAgIGhhc2gudXBkYXRlKGxvZ2luVG9rZW4pO1xuICAgIHJldHVybiBoYXNoLmRpZ2VzdCgnYmFzZTY0Jyk7XG4gIH07XG5cbiAgLy8ge3Rva2VuLCB3aGVufSA9PiB7aGFzaGVkVG9rZW4sIHdoZW59XG4gIF9oYXNoU3RhbXBlZFRva2VuKHN0YW1wZWRUb2tlbikge1xuICAgIGNvbnN0IHsgdG9rZW4sIC4uLmhhc2hlZFN0YW1wZWRUb2tlbiB9ID0gc3RhbXBlZFRva2VuO1xuICAgIHJldHVybiB7XG4gICAgICAuLi5oYXNoZWRTdGFtcGVkVG9rZW4sXG4gICAgICBoYXNoZWRUb2tlbjogdGhpcy5faGFzaExvZ2luVG9rZW4odG9rZW4pXG4gICAgfTtcbiAgfTtcblxuICAvLyBVc2luZyAkYWRkVG9TZXQgYXZvaWRzIGdldHRpbmcgYW4gaW5kZXggZXJyb3IgaWYgYW5vdGhlciBjbGllbnRcbiAgLy8gbG9nZ2luZyBpbiBzaW11bHRhbmVvdXNseSBoYXMgYWxyZWFkeSBpbnNlcnRlZCB0aGUgbmV3IGhhc2hlZFxuICAvLyB0b2tlbi5cbiAgX2luc2VydEhhc2hlZExvZ2luVG9rZW4odXNlcklkLCBoYXNoZWRUb2tlbiwgcXVlcnkpIHtcbiAgICBxdWVyeSA9IHF1ZXJ5ID8geyAuLi5xdWVyeSB9IDoge307XG4gICAgcXVlcnkuX2lkID0gdXNlcklkO1xuICAgIHRoaXMudXNlcnMudXBkYXRlKHF1ZXJ5LCB7XG4gICAgICAkYWRkVG9TZXQ6IHtcbiAgICAgICAgXCJzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnNcIjogaGFzaGVkVG9rZW5cbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcblxuICAvLyBFeHBvcnRlZCBmb3IgdGVzdHMuXG4gIF9pbnNlcnRMb2dpblRva2VuKHVzZXJJZCwgc3RhbXBlZFRva2VuLCBxdWVyeSkge1xuICAgIHRoaXMuX2luc2VydEhhc2hlZExvZ2luVG9rZW4oXG4gICAgICB1c2VySWQsXG4gICAgICB0aGlzLl9oYXNoU3RhbXBlZFRva2VuKHN0YW1wZWRUb2tlbiksXG4gICAgICBxdWVyeVxuICAgICk7XG4gIH07XG5cbiAgX2NsZWFyQWxsTG9naW5Ub2tlbnModXNlcklkKSB7XG4gICAgdGhpcy51c2Vycy51cGRhdGUodXNlcklkLCB7XG4gICAgICAkc2V0OiB7XG4gICAgICAgICdzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnMnOiBbXVxuICAgICAgfVxuICAgIH0pO1xuICB9O1xuXG4gIC8vIHRlc3QgaG9va1xuICBfZ2V0VXNlck9ic2VydmUoY29ubmVjdGlvbklkKSB7XG4gICAgcmV0dXJuIHRoaXMuX3VzZXJPYnNlcnZlc0ZvckNvbm5lY3Rpb25zW2Nvbm5lY3Rpb25JZF07XG4gIH07XG5cbiAgLy8gQ2xlYW4gdXAgdGhpcyBjb25uZWN0aW9uJ3MgYXNzb2NpYXRpb24gd2l0aCB0aGUgdG9rZW46IHRoYXQgaXMsIHN0b3BcbiAgLy8gdGhlIG9ic2VydmUgdGhhdCB3ZSBzdGFydGVkIHdoZW4gd2UgYXNzb2NpYXRlZCB0aGUgY29ubmVjdGlvbiB3aXRoXG4gIC8vIHRoaXMgdG9rZW4uXG4gIF9yZW1vdmVUb2tlbkZyb21Db25uZWN0aW9uKGNvbm5lY3Rpb25JZCkge1xuICAgIGlmIChoYXNPd24uY2FsbCh0aGlzLl91c2VyT2JzZXJ2ZXNGb3JDb25uZWN0aW9ucywgY29ubmVjdGlvbklkKSkge1xuICAgICAgY29uc3Qgb2JzZXJ2ZSA9IHRoaXMuX3VzZXJPYnNlcnZlc0ZvckNvbm5lY3Rpb25zW2Nvbm5lY3Rpb25JZF07XG4gICAgICBpZiAodHlwZW9mIG9ic2VydmUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIC8vIFdlJ3JlIGluIHRoZSBwcm9jZXNzIG9mIHNldHRpbmcgdXAgYW4gb2JzZXJ2ZSBmb3IgdGhpcyBjb25uZWN0aW9uLiBXZVxuICAgICAgICAvLyBjYW4ndCBjbGVhbiB1cCB0aGF0IG9ic2VydmUgeWV0LCBidXQgaWYgd2UgZGVsZXRlIHRoZSBwbGFjZWhvbGRlciBmb3JcbiAgICAgICAgLy8gdGhpcyBjb25uZWN0aW9uLCB0aGVuIHRoZSBvYnNlcnZlIHdpbGwgZ2V0IGNsZWFuZWQgdXAgYXMgc29vbiBhcyBpdCBoYXNcbiAgICAgICAgLy8gYmVlbiBzZXQgdXAuXG4gICAgICAgIGRlbGV0ZSB0aGlzLl91c2VyT2JzZXJ2ZXNGb3JDb25uZWN0aW9uc1tjb25uZWN0aW9uSWRdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuX3VzZXJPYnNlcnZlc0ZvckNvbm5lY3Rpb25zW2Nvbm5lY3Rpb25JZF07XG4gICAgICAgIG9ic2VydmUuc3RvcCgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBfZ2V0TG9naW5Ub2tlbihjb25uZWN0aW9uSWQpIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0QWNjb3VudERhdGEoY29ubmVjdGlvbklkLCAnbG9naW5Ub2tlbicpO1xuICB9O1xuXG4gIC8vIG5ld1Rva2VuIGlzIGEgaGFzaGVkIHRva2VuLlxuICBfc2V0TG9naW5Ub2tlbih1c2VySWQsIGNvbm5lY3Rpb24sIG5ld1Rva2VuKSB7XG4gICAgdGhpcy5fcmVtb3ZlVG9rZW5Gcm9tQ29ubmVjdGlvbihjb25uZWN0aW9uLmlkKTtcbiAgICB0aGlzLl9zZXRBY2NvdW50RGF0YShjb25uZWN0aW9uLmlkLCAnbG9naW5Ub2tlbicsIG5ld1Rva2VuKTtcblxuICAgIGlmIChuZXdUb2tlbikge1xuICAgICAgLy8gU2V0IHVwIGFuIG9ic2VydmUgZm9yIHRoaXMgdG9rZW4uIElmIHRoZSB0b2tlbiBnb2VzIGF3YXksIHdlIG5lZWRcbiAgICAgIC8vIHRvIGNsb3NlIHRoZSBjb25uZWN0aW9uLiAgV2UgZGVmZXIgdGhlIG9ic2VydmUgYmVjYXVzZSB0aGVyZSdzXG4gICAgICAvLyBubyBuZWVkIGZvciBpdCB0byBiZSBvbiB0aGUgY3JpdGljYWwgcGF0aCBmb3IgbG9naW47IHdlIGp1c3QgbmVlZFxuICAgICAgLy8gdG8gZW5zdXJlIHRoYXQgdGhlIGNvbm5lY3Rpb24gd2lsbCBnZXQgY2xvc2VkIGF0IHNvbWUgcG9pbnQgaWZcbiAgICAgIC8vIHRoZSB0b2tlbiBnZXRzIGRlbGV0ZWQuXG4gICAgICAvL1xuICAgICAgLy8gSW5pdGlhbGx5LCB3ZSBzZXQgdGhlIG9ic2VydmUgZm9yIHRoaXMgY29ubmVjdGlvbiB0byBhIG51bWJlcjsgdGhpc1xuICAgICAgLy8gc2lnbmlmaWVzIHRvIG90aGVyIGNvZGUgKHdoaWNoIG1pZ2h0IHJ1biB3aGlsZSB3ZSB5aWVsZCkgdGhhdCB3ZSBhcmUgaW5cbiAgICAgIC8vIHRoZSBwcm9jZXNzIG9mIHNldHRpbmcgdXAgYW4gb2JzZXJ2ZSBmb3IgdGhpcyBjb25uZWN0aW9uLiBPbmNlIHRoZVxuICAgICAgLy8gb2JzZXJ2ZSBpcyByZWFkeSB0byBnbywgd2UgcmVwbGFjZSB0aGUgbnVtYmVyIHdpdGggdGhlIHJlYWwgb2JzZXJ2ZVxuICAgICAgLy8gaGFuZGxlICh1bmxlc3MgdGhlIHBsYWNlaG9sZGVyIGhhcyBiZWVuIGRlbGV0ZWQgb3IgcmVwbGFjZWQgYnkgYVxuICAgICAgLy8gZGlmZmVyZW50IHBsYWNlaG9sZCBudW1iZXIsIHNpZ25pZnlpbmcgdGhhdCB0aGUgY29ubmVjdGlvbiB3YXMgY2xvc2VkXG4gICAgICAvLyBhbHJlYWR5IC0tIGluIHRoaXMgY2FzZSB3ZSBqdXN0IGNsZWFuIHVwIHRoZSBvYnNlcnZlIHRoYXQgd2Ugc3RhcnRlZCkuXG4gICAgICBjb25zdCBteU9ic2VydmVOdW1iZXIgPSArK3RoaXMuX25leHRVc2VyT2JzZXJ2ZU51bWJlcjtcbiAgICAgIHRoaXMuX3VzZXJPYnNlcnZlc0ZvckNvbm5lY3Rpb25zW2Nvbm5lY3Rpb24uaWRdID0gbXlPYnNlcnZlTnVtYmVyO1xuICAgICAgTWV0ZW9yLmRlZmVyKCgpID0+IHtcbiAgICAgICAgLy8gSWYgc29tZXRoaW5nIGVsc2UgaGFwcGVuZWQgb24gdGhpcyBjb25uZWN0aW9uIGluIHRoZSBtZWFudGltZSAoaXQgZ290XG4gICAgICAgIC8vIGNsb3NlZCwgb3IgYW5vdGhlciBjYWxsIHRvIF9zZXRMb2dpblRva2VuIGhhcHBlbmVkKSwganVzdCBkb1xuICAgICAgICAvLyBub3RoaW5nLiBXZSBkb24ndCBuZWVkIHRvIHN0YXJ0IGFuIG9ic2VydmUgZm9yIGFuIG9sZCBjb25uZWN0aW9uIG9yIG9sZFxuICAgICAgICAvLyB0b2tlbi5cbiAgICAgICAgaWYgKHRoaXMuX3VzZXJPYnNlcnZlc0ZvckNvbm5lY3Rpb25zW2Nvbm5lY3Rpb24uaWRdICE9PSBteU9ic2VydmVOdW1iZXIpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgZm91bmRNYXRjaGluZ1VzZXI7XG4gICAgICAgIC8vIEJlY2F1c2Ugd2UgdXBncmFkZSB1bmhhc2hlZCBsb2dpbiB0b2tlbnMgdG8gaGFzaGVkIHRva2VucyBhdFxuICAgICAgICAvLyBsb2dpbiB0aW1lLCBzZXNzaW9ucyB3aWxsIG9ubHkgYmUgbG9nZ2VkIGluIHdpdGggYSBoYXNoZWRcbiAgICAgICAgLy8gdG9rZW4uIFRodXMgd2Ugb25seSBuZWVkIHRvIG9ic2VydmUgaGFzaGVkIHRva2VucyBoZXJlLlxuICAgICAgICBjb25zdCBvYnNlcnZlID0gdGhpcy51c2Vycy5maW5kKHtcbiAgICAgICAgICBfaWQ6IHVzZXJJZCxcbiAgICAgICAgICAnc2VydmljZXMucmVzdW1lLmxvZ2luVG9rZW5zLmhhc2hlZFRva2VuJzogbmV3VG9rZW5cbiAgICAgICAgfSwgeyBmaWVsZHM6IHsgX2lkOiAxIH0gfSkub2JzZXJ2ZUNoYW5nZXMoe1xuICAgICAgICAgIGFkZGVkOiAoKSA9PiB7XG4gICAgICAgICAgICBmb3VuZE1hdGNoaW5nVXNlciA9IHRydWU7XG4gICAgICAgICAgfSxcbiAgICAgICAgICByZW1vdmVkOiBjb25uZWN0aW9uLmNsb3NlLFxuICAgICAgICAgIC8vIFRoZSBvbkNsb3NlIGNhbGxiYWNrIGZvciB0aGUgY29ubmVjdGlvbiB0YWtlcyBjYXJlIG9mXG4gICAgICAgICAgLy8gY2xlYW5pbmcgdXAgdGhlIG9ic2VydmUgaGFuZGxlIGFuZCBhbnkgb3RoZXIgc3RhdGUgd2UgaGF2ZVxuICAgICAgICAgIC8vIGx5aW5nIGFyb3VuZC5cbiAgICAgICAgfSwgeyBub25NdXRhdGluZ0NhbGxiYWNrczogdHJ1ZSB9KTtcblxuICAgICAgICAvLyBJZiB0aGUgdXNlciByYW4gYW5vdGhlciBsb2dpbiBvciBsb2dvdXQgY29tbWFuZCB3ZSB3ZXJlIHdhaXRpbmcgZm9yIHRoZVxuICAgICAgICAvLyBkZWZlciBvciBhZGRlZCB0byBmaXJlIChpZSwgYW5vdGhlciBjYWxsIHRvIF9zZXRMb2dpblRva2VuIG9jY3VycmVkKSxcbiAgICAgICAgLy8gdGhlbiB3ZSBsZXQgdGhlIGxhdGVyIG9uZSB3aW4gKHN0YXJ0IGFuIG9ic2VydmUsIGV0YykgYW5kIGp1c3Qgc3RvcCBvdXJcbiAgICAgICAgLy8gb2JzZXJ2ZSBub3cuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFNpbWlsYXJseSwgaWYgdGhlIGNvbm5lY3Rpb24gd2FzIGFscmVhZHkgY2xvc2VkLCB0aGVuIHRoZSBvbkNsb3NlXG4gICAgICAgIC8vIGNhbGxiYWNrIHdvdWxkIGhhdmUgY2FsbGVkIF9yZW1vdmVUb2tlbkZyb21Db25uZWN0aW9uIGFuZCB0aGVyZSB3b24ndFxuICAgICAgICAvLyBiZSBhbiBlbnRyeSBpbiBfdXNlck9ic2VydmVzRm9yQ29ubmVjdGlvbnMuIFdlIGNhbiBzdG9wIHRoZSBvYnNlcnZlLlxuICAgICAgICBpZiAodGhpcy5fdXNlck9ic2VydmVzRm9yQ29ubmVjdGlvbnNbY29ubmVjdGlvbi5pZF0gIT09IG15T2JzZXJ2ZU51bWJlcikge1xuICAgICAgICAgIG9ic2VydmUuc3RvcCgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3VzZXJPYnNlcnZlc0ZvckNvbm5lY3Rpb25zW2Nvbm5lY3Rpb24uaWRdID0gb2JzZXJ2ZTtcblxuICAgICAgICBpZiAoISBmb3VuZE1hdGNoaW5nVXNlcikge1xuICAgICAgICAgIC8vIFdlJ3ZlIHNldCB1cCBhbiBvYnNlcnZlIG9uIHRoZSB1c2VyIGFzc29jaWF0ZWQgd2l0aCBgbmV3VG9rZW5gLFxuICAgICAgICAgIC8vIHNvIGlmIHRoZSBuZXcgdG9rZW4gaXMgcmVtb3ZlZCBmcm9tIHRoZSBkYXRhYmFzZSwgd2UnbGwgY2xvc2VcbiAgICAgICAgICAvLyB0aGUgY29ubmVjdGlvbi4gQnV0IHRoZSB0b2tlbiBtaWdodCBoYXZlIGFscmVhZHkgYmVlbiBkZWxldGVkXG4gICAgICAgICAgLy8gYmVmb3JlIHdlIHNldCB1cCB0aGUgb2JzZXJ2ZSwgd2hpY2ggd291bGRuJ3QgaGF2ZSBjbG9zZWQgdGhlXG4gICAgICAgICAgLy8gY29ubmVjdGlvbiBiZWNhdXNlIHRoZSBvYnNlcnZlIHdhc24ndCBydW5uaW5nIHlldC5cbiAgICAgICAgICBjb25uZWN0aW9uLmNsb3NlKCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcblxuICAvLyAoQWxzbyB1c2VkIGJ5IE1ldGVvciBBY2NvdW50cyBzZXJ2ZXIgYW5kIHRlc3RzKS5cbiAgLy9cbiAgX2dlbmVyYXRlU3RhbXBlZExvZ2luVG9rZW4oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHRva2VuOiBSYW5kb20uc2VjcmV0KCksXG4gICAgICB3aGVuOiBuZXcgRGF0ZVxuICAgIH07XG4gIH07XG5cbiAgLy8vXG4gIC8vLyBUT0tFTiBFWFBJUkFUSU9OXG4gIC8vL1xuXG4gIC8vIERlbGV0ZXMgZXhwaXJlZCBwYXNzd29yZCByZXNldCB0b2tlbnMgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vXG4gIC8vIEV4cG9ydGVkIGZvciB0ZXN0cy4gQWxzbywgdGhlIGFyZ3VtZW50cyBhcmUgb25seSB1c2VkIGJ5XG4gIC8vIHRlc3RzLiBvbGRlc3RWYWxpZERhdGUgaXMgc2ltdWxhdGUgZXhwaXJpbmcgdG9rZW5zIHdpdGhvdXQgd2FpdGluZ1xuICAvLyBmb3IgdGhlbSB0byBhY3R1YWxseSBleHBpcmUuIHVzZXJJZCBpcyB1c2VkIGJ5IHRlc3RzIHRvIG9ubHkgZXhwaXJlXG4gIC8vIHRva2VucyBmb3IgdGhlIHRlc3QgdXNlci5cbiAgX2V4cGlyZVBhc3N3b3JkUmVzZXRUb2tlbnMob2xkZXN0VmFsaWREYXRlLCB1c2VySWQpIHtcbiAgICBjb25zdCB0b2tlbkxpZmV0aW1lTXMgPSB0aGlzLl9nZXRQYXNzd29yZFJlc2V0VG9rZW5MaWZldGltZU1zKCk7XG5cbiAgICAvLyB3aGVuIGNhbGxpbmcgZnJvbSBhIHRlc3Qgd2l0aCBleHRyYSBhcmd1bWVudHMsIHlvdSBtdXN0IHNwZWNpZnkgYm90aCFcbiAgICBpZiAoKG9sZGVzdFZhbGlkRGF0ZSAmJiAhdXNlcklkKSB8fCAoIW9sZGVzdFZhbGlkRGF0ZSAmJiB1c2VySWQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJCYWQgdGVzdC4gTXVzdCBzcGVjaWZ5IGJvdGggb2xkZXN0VmFsaWREYXRlIGFuZCB1c2VySWQuXCIpO1xuICAgIH1cblxuICAgIG9sZGVzdFZhbGlkRGF0ZSA9IG9sZGVzdFZhbGlkRGF0ZSB8fFxuICAgICAgKG5ldyBEYXRlKG5ldyBEYXRlKCkgLSB0b2tlbkxpZmV0aW1lTXMpKTtcblxuICAgIGNvbnN0IHRva2VuRmlsdGVyID0ge1xuICAgICAgJG9yOiBbXG4gICAgICAgIHsgXCJzZXJ2aWNlcy5wYXNzd29yZC5yZXNldC5yZWFzb25cIjogXCJyZXNldFwifSxcbiAgICAgICAgeyBcInNlcnZpY2VzLnBhc3N3b3JkLnJlc2V0LnJlYXNvblwiOiB7JGV4aXN0czogZmFsc2V9fVxuICAgICAgXVxuICAgIH07XG5cbiAgICBleHBpcmVQYXNzd29yZFRva2VuKHRoaXMsIG9sZGVzdFZhbGlkRGF0ZSwgdG9rZW5GaWx0ZXIsIHVzZXJJZCk7XG4gIH1cblxuICAvLyBEZWxldGVzIGV4cGlyZWQgcGFzc3dvcmQgZW5yb2xsIHRva2VucyBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy9cbiAgLy8gRXhwb3J0ZWQgZm9yIHRlc3RzLiBBbHNvLCB0aGUgYXJndW1lbnRzIGFyZSBvbmx5IHVzZWQgYnlcbiAgLy8gdGVzdHMuIG9sZGVzdFZhbGlkRGF0ZSBpcyBzaW11bGF0ZSBleHBpcmluZyB0b2tlbnMgd2l0aG91dCB3YWl0aW5nXG4gIC8vIGZvciB0aGVtIHRvIGFjdHVhbGx5IGV4cGlyZS4gdXNlcklkIGlzIHVzZWQgYnkgdGVzdHMgdG8gb25seSBleHBpcmVcbiAgLy8gdG9rZW5zIGZvciB0aGUgdGVzdCB1c2VyLlxuICBfZXhwaXJlUGFzc3dvcmRFbnJvbGxUb2tlbnMob2xkZXN0VmFsaWREYXRlLCB1c2VySWQpIHtcbiAgICBjb25zdCB0b2tlbkxpZmV0aW1lTXMgPSB0aGlzLl9nZXRQYXNzd29yZEVucm9sbFRva2VuTGlmZXRpbWVNcygpO1xuXG4gICAgLy8gd2hlbiBjYWxsaW5nIGZyb20gYSB0ZXN0IHdpdGggZXh0cmEgYXJndW1lbnRzLCB5b3UgbXVzdCBzcGVjaWZ5IGJvdGghXG4gICAgaWYgKChvbGRlc3RWYWxpZERhdGUgJiYgIXVzZXJJZCkgfHwgKCFvbGRlc3RWYWxpZERhdGUgJiYgdXNlcklkKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQmFkIHRlc3QuIE11c3Qgc3BlY2lmeSBib3RoIG9sZGVzdFZhbGlkRGF0ZSBhbmQgdXNlcklkLlwiKTtcbiAgICB9XG5cbiAgICBvbGRlc3RWYWxpZERhdGUgPSBvbGRlc3RWYWxpZERhdGUgfHxcbiAgICAgIChuZXcgRGF0ZShuZXcgRGF0ZSgpIC0gdG9rZW5MaWZldGltZU1zKSk7XG5cbiAgICBjb25zdCB0b2tlbkZpbHRlciA9IHtcbiAgICAgIFwic2VydmljZXMucGFzc3dvcmQuZW5yb2xsLnJlYXNvblwiOiBcImVucm9sbFwiXG4gICAgfTtcblxuICAgIGV4cGlyZVBhc3N3b3JkVG9rZW4odGhpcywgb2xkZXN0VmFsaWREYXRlLCB0b2tlbkZpbHRlciwgdXNlcklkKTtcbiAgfVxuXG4gIC8vIERlbGV0ZXMgZXhwaXJlZCB0b2tlbnMgZnJvbSB0aGUgZGF0YWJhc2UgYW5kIGNsb3NlcyBhbGwgb3BlbiBjb25uZWN0aW9uc1xuICAvLyBhc3NvY2lhdGVkIHdpdGggdGhlc2UgdG9rZW5zLlxuICAvL1xuICAvLyBFeHBvcnRlZCBmb3IgdGVzdHMuIEFsc28sIHRoZSBhcmd1bWVudHMgYXJlIG9ubHkgdXNlZCBieVxuICAvLyB0ZXN0cy4gb2xkZXN0VmFsaWREYXRlIGlzIHNpbXVsYXRlIGV4cGlyaW5nIHRva2VucyB3aXRob3V0IHdhaXRpbmdcbiAgLy8gZm9yIHRoZW0gdG8gYWN0dWFsbHkgZXhwaXJlLiB1c2VySWQgaXMgdXNlZCBieSB0ZXN0cyB0byBvbmx5IGV4cGlyZVxuICAvLyB0b2tlbnMgZm9yIHRoZSB0ZXN0IHVzZXIuXG4gIF9leHBpcmVUb2tlbnMob2xkZXN0VmFsaWREYXRlLCB1c2VySWQpIHtcbiAgICBjb25zdCB0b2tlbkxpZmV0aW1lTXMgPSB0aGlzLl9nZXRUb2tlbkxpZmV0aW1lTXMoKTtcblxuICAgIC8vIHdoZW4gY2FsbGluZyBmcm9tIGEgdGVzdCB3aXRoIGV4dHJhIGFyZ3VtZW50cywgeW91IG11c3Qgc3BlY2lmeSBib3RoIVxuICAgIGlmICgob2xkZXN0VmFsaWREYXRlICYmICF1c2VySWQpIHx8ICghb2xkZXN0VmFsaWREYXRlICYmIHVzZXJJZCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkJhZCB0ZXN0LiBNdXN0IHNwZWNpZnkgYm90aCBvbGRlc3RWYWxpZERhdGUgYW5kIHVzZXJJZC5cIik7XG4gICAgfVxuXG4gICAgb2xkZXN0VmFsaWREYXRlID0gb2xkZXN0VmFsaWREYXRlIHx8XG4gICAgICAobmV3IERhdGUobmV3IERhdGUoKSAtIHRva2VuTGlmZXRpbWVNcykpO1xuICAgIGNvbnN0IHVzZXJGaWx0ZXIgPSB1c2VySWQgPyB7X2lkOiB1c2VySWR9IDoge307XG5cblxuICAgIC8vIEJhY2t3YXJkcyBjb21wYXRpYmxlIHdpdGggb2xkZXIgdmVyc2lvbnMgb2YgbWV0ZW9yIHRoYXQgc3RvcmVkIGxvZ2luIHRva2VuXG4gICAgLy8gdGltZXN0YW1wcyBhcyBudW1iZXJzLlxuICAgIHRoaXMudXNlcnMudXBkYXRlKHsgLi4udXNlckZpbHRlcixcbiAgICAgICRvcjogW1xuICAgICAgICB7IFwic2VydmljZXMucmVzdW1lLmxvZ2luVG9rZW5zLndoZW5cIjogeyAkbHQ6IG9sZGVzdFZhbGlkRGF0ZSB9IH0sXG4gICAgICAgIHsgXCJzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnMud2hlblwiOiB7ICRsdDogK29sZGVzdFZhbGlkRGF0ZSB9IH1cbiAgICAgIF1cbiAgICB9LCB7XG4gICAgICAkcHVsbDoge1xuICAgICAgICBcInNlcnZpY2VzLnJlc3VtZS5sb2dpblRva2Vuc1wiOiB7XG4gICAgICAgICAgJG9yOiBbXG4gICAgICAgICAgICB7IHdoZW46IHsgJGx0OiBvbGRlc3RWYWxpZERhdGUgfSB9LFxuICAgICAgICAgICAgeyB3aGVuOiB7ICRsdDogK29sZGVzdFZhbGlkRGF0ZSB9IH1cbiAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LCB7IG11bHRpOiB0cnVlIH0pO1xuICAgIC8vIFRoZSBvYnNlcnZlIG9uIE1ldGVvci51c2VycyB3aWxsIHRha2UgY2FyZSBvZiBjbG9zaW5nIGNvbm5lY3Rpb25zIGZvclxuICAgIC8vIGV4cGlyZWQgdG9rZW5zLlxuICB9O1xuXG4gIC8vIEBvdmVycmlkZSBmcm9tIGFjY291bnRzX2NvbW1vbi5qc1xuICBjb25maWcob3B0aW9ucykge1xuICAgIC8vIENhbGwgdGhlIG92ZXJyaWRkZW4gaW1wbGVtZW50YXRpb24gb2YgdGhlIG1ldGhvZC5cbiAgICBjb25zdCBzdXBlclJlc3VsdCA9IEFjY291bnRzQ29tbW9uLnByb3RvdHlwZS5jb25maWcuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblxuICAgIC8vIElmIHRoZSB1c2VyIHNldCBsb2dpbkV4cGlyYXRpb25JbkRheXMgdG8gbnVsbCwgdGhlbiB3ZSBuZWVkIHRvIGNsZWFyIHRoZVxuICAgIC8vIHRpbWVyIHRoYXQgcGVyaW9kaWNhbGx5IGV4cGlyZXMgdG9rZW5zLlxuICAgIGlmIChoYXNPd24uY2FsbCh0aGlzLl9vcHRpb25zLCAnbG9naW5FeHBpcmF0aW9uSW5EYXlzJykgJiZcbiAgICAgIHRoaXMuX29wdGlvbnMubG9naW5FeHBpcmF0aW9uSW5EYXlzID09PSBudWxsICYmXG4gICAgICB0aGlzLmV4cGlyZVRva2VuSW50ZXJ2YWwpIHtcbiAgICAgIE1ldGVvci5jbGVhckludGVydmFsKHRoaXMuZXhwaXJlVG9rZW5JbnRlcnZhbCk7XG4gICAgICB0aGlzLmV4cGlyZVRva2VuSW50ZXJ2YWwgPSBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBzdXBlclJlc3VsdDtcbiAgfTtcblxuICAvLyBDYWxsZWQgYnkgYWNjb3VudHMtcGFzc3dvcmRcbiAgaW5zZXJ0VXNlckRvYyhvcHRpb25zLCB1c2VyKSB7XG4gICAgLy8gLSBjbG9uZSB1c2VyIGRvY3VtZW50LCB0byBwcm90ZWN0IGZyb20gbW9kaWZpY2F0aW9uXG4gICAgLy8gLSBhZGQgY3JlYXRlZEF0IHRpbWVzdGFtcFxuICAgIC8vIC0gcHJlcGFyZSBhbiBfaWQsIHNvIHRoYXQgeW91IGNhbiBtb2RpZnkgb3RoZXIgY29sbGVjdGlvbnMgKGVnXG4gICAgLy8gY3JlYXRlIGEgZmlyc3QgdGFzayBmb3IgZXZlcnkgbmV3IHVzZXIpXG4gICAgLy9cbiAgICAvLyBYWFggSWYgdGhlIG9uQ3JlYXRlVXNlciBvciB2YWxpZGF0ZU5ld1VzZXIgaG9va3MgZmFpbCwgd2UgbWlnaHRcbiAgICAvLyBlbmQgdXAgaGF2aW5nIG1vZGlmaWVkIHNvbWUgb3RoZXIgY29sbGVjdGlvblxuICAgIC8vIGluYXBwcm9wcmlhdGVseS4gVGhlIHNvbHV0aW9uIGlzIHByb2JhYmx5IHRvIGhhdmUgb25DcmVhdGVVc2VyXG4gICAgLy8gYWNjZXB0IHR3byBjYWxsYmFja3MgLSBvbmUgdGhhdCBnZXRzIGNhbGxlZCBiZWZvcmUgaW5zZXJ0aW5nXG4gICAgLy8gdGhlIHVzZXIgZG9jdW1lbnQgKGluIHdoaWNoIHlvdSBjYW4gbW9kaWZ5IGl0cyBjb250ZW50cyksIGFuZFxuICAgIC8vIG9uZSB0aGF0IGdldHMgY2FsbGVkIGFmdGVyIChpbiB3aGljaCB5b3Ugc2hvdWxkIGNoYW5nZSBvdGhlclxuICAgIC8vIGNvbGxlY3Rpb25zKVxuICAgIHVzZXIgPSB7XG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgICBfaWQ6IFJhbmRvbS5pZCgpLFxuICAgICAgLi4udXNlcixcbiAgICB9O1xuXG4gICAgaWYgKHVzZXIuc2VydmljZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuc2VydmljZXMpLmZvckVhY2goc2VydmljZSA9PlxuICAgICAgICBwaW5FbmNyeXB0ZWRGaWVsZHNUb1VzZXIodXNlci5zZXJ2aWNlc1tzZXJ2aWNlXSwgdXNlci5faWQpXG4gICAgICApO1xuICAgIH1cblxuICAgIGxldCBmdWxsVXNlcjtcbiAgICBpZiAodGhpcy5fb25DcmVhdGVVc2VySG9vaykge1xuICAgICAgZnVsbFVzZXIgPSB0aGlzLl9vbkNyZWF0ZVVzZXJIb29rKG9wdGlvbnMsIHVzZXIpO1xuXG4gICAgICAvLyBUaGlzIGlzICpub3QqIHBhcnQgb2YgdGhlIEFQSS4gV2UgbmVlZCB0aGlzIGJlY2F1c2Ugd2UgY2FuJ3QgaXNvbGF0ZVxuICAgICAgLy8gdGhlIGdsb2JhbCBzZXJ2ZXIgZW52aXJvbm1lbnQgYmV0d2VlbiB0ZXN0cywgbWVhbmluZyB3ZSBjYW4ndCB0ZXN0XG4gICAgICAvLyBib3RoIGhhdmluZyBhIGNyZWF0ZSB1c2VyIGhvb2sgc2V0IGFuZCBub3QgaGF2aW5nIG9uZSBzZXQuXG4gICAgICBpZiAoZnVsbFVzZXIgPT09ICdURVNUIERFRkFVTFQgSE9PSycpXG4gICAgICAgIGZ1bGxVc2VyID0gZGVmYXVsdENyZWF0ZVVzZXJIb29rKG9wdGlvbnMsIHVzZXIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmdWxsVXNlciA9IGRlZmF1bHRDcmVhdGVVc2VySG9vayhvcHRpb25zLCB1c2VyKTtcbiAgICB9XG5cbiAgICB0aGlzLl92YWxpZGF0ZU5ld1VzZXJIb29rcy5mb3JFYWNoKGhvb2sgPT4ge1xuICAgICAgaWYgKCEgaG9vayhmdWxsVXNlcikpXG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBcIlVzZXIgdmFsaWRhdGlvbiBmYWlsZWRcIik7XG4gICAgfSk7XG5cbiAgICBsZXQgdXNlcklkO1xuICAgIHRyeSB7XG4gICAgICB1c2VySWQgPSB0aGlzLnVzZXJzLmluc2VydChmdWxsVXNlcik7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLy8gWFhYIHN0cmluZyBwYXJzaW5nIHN1Y2tzLCBtYXliZVxuICAgICAgLy8gaHR0cHM6Ly9qaXJhLm1vbmdvZGIub3JnL2Jyb3dzZS9TRVJWRVItMzA2OSB3aWxsIGdldCBmaXhlZCBvbmUgZGF5XG4gICAgICAvLyBodHRwczovL2ppcmEubW9uZ29kYi5vcmcvYnJvd3NlL1NFUlZFUi00NjM3XG4gICAgICBpZiAoIWUuZXJybXNnKSB0aHJvdyBlO1xuICAgICAgaWYgKGUuZXJybXNnLmluY2x1ZGVzKCdlbWFpbHMuYWRkcmVzcycpKVxuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKDQwMywgXCJFbWFpbCBhbHJlYWR5IGV4aXN0cy5cIik7XG4gICAgICBpZiAoZS5lcnJtc2cuaW5jbHVkZXMoJ3VzZXJuYW1lJykpXG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBcIlVzZXJuYW1lIGFscmVhZHkgZXhpc3RzLlwiKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIHJldHVybiB1c2VySWQ7XG4gIH07XG5cbiAgLy8gSGVscGVyIGZ1bmN0aW9uOiByZXR1cm5zIGZhbHNlIGlmIGVtYWlsIGRvZXMgbm90IG1hdGNoIGNvbXBhbnkgZG9tYWluIGZyb21cbiAgLy8gdGhlIGNvbmZpZ3VyYXRpb24uXG4gIF90ZXN0RW1haWxEb21haW4oZW1haWwpIHtcbiAgICBjb25zdCBkb21haW4gPSB0aGlzLl9vcHRpb25zLnJlc3RyaWN0Q3JlYXRpb25CeUVtYWlsRG9tYWluO1xuXG4gICAgcmV0dXJuICFkb21haW4gfHxcbiAgICAgICh0eXBlb2YgZG9tYWluID09PSAnZnVuY3Rpb24nICYmIGRvbWFpbihlbWFpbCkpIHx8XG4gICAgICAodHlwZW9mIGRvbWFpbiA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgKG5ldyBSZWdFeHAoYEAke01ldGVvci5fZXNjYXBlUmVnRXhwKGRvbWFpbil9JGAsICdpJykpLnRlc3QoZW1haWwpKTtcbiAgfTtcblxuICAvLy9cbiAgLy8vIENMRUFOIFVQIEZPUiBgbG9nb3V0T3RoZXJDbGllbnRzYFxuICAvLy9cblxuICBfZGVsZXRlU2F2ZWRUb2tlbnNGb3JVc2VyKHVzZXJJZCwgdG9rZW5zVG9EZWxldGUpIHtcbiAgICBpZiAodG9rZW5zVG9EZWxldGUpIHtcbiAgICAgIHRoaXMudXNlcnMudXBkYXRlKHVzZXJJZCwge1xuICAgICAgICAkdW5zZXQ6IHtcbiAgICAgICAgICBcInNlcnZpY2VzLnJlc3VtZS5oYXZlTG9naW5Ub2tlbnNUb0RlbGV0ZVwiOiAxLFxuICAgICAgICAgIFwic2VydmljZXMucmVzdW1lLmxvZ2luVG9rZW5zVG9EZWxldGVcIjogMVxuICAgICAgICB9LFxuICAgICAgICAkcHVsbEFsbDoge1xuICAgICAgICAgIFwic2VydmljZXMucmVzdW1lLmxvZ2luVG9rZW5zXCI6IHRva2Vuc1RvRGVsZXRlXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcblxuICBfZGVsZXRlU2F2ZWRUb2tlbnNGb3JBbGxVc2Vyc09uU3RhcnR1cCgpIHtcbiAgICAvLyBJZiB3ZSBmaW5kIHVzZXJzIHdobyBoYXZlIHNhdmVkIHRva2VucyB0byBkZWxldGUgb24gc3RhcnR1cCwgZGVsZXRlXG4gICAgLy8gdGhlbSBub3cuIEl0J3MgcG9zc2libGUgdGhhdCB0aGUgc2VydmVyIGNvdWxkIGhhdmUgY3Jhc2hlZCBhbmQgY29tZVxuICAgIC8vIGJhY2sgdXAgYmVmb3JlIG5ldyB0b2tlbnMgYXJlIGZvdW5kIGluIGxvY2FsU3RvcmFnZSwgYnV0IHRoaXNcbiAgICAvLyBzaG91bGRuJ3QgaGFwcGVuIHZlcnkgb2Z0ZW4uIFdlIHNob3VsZG4ndCBwdXQgYSBkZWxheSBoZXJlIGJlY2F1c2VcbiAgICAvLyB0aGF0IHdvdWxkIGdpdmUgYSBsb3Qgb2YgcG93ZXIgdG8gYW4gYXR0YWNrZXIgd2l0aCBhIHN0b2xlbiBsb2dpblxuICAgIC8vIHRva2VuIGFuZCB0aGUgYWJpbGl0eSB0byBjcmFzaCB0aGUgc2VydmVyLlxuICAgIE1ldGVvci5zdGFydHVwKCgpID0+IHtcbiAgICAgIHRoaXMudXNlcnMuZmluZCh7XG4gICAgICAgIFwic2VydmljZXMucmVzdW1lLmhhdmVMb2dpblRva2Vuc1RvRGVsZXRlXCI6IHRydWVcbiAgICAgIH0sIHtmaWVsZHM6IHtcbiAgICAgICAgICBcInNlcnZpY2VzLnJlc3VtZS5sb2dpblRva2Vuc1RvRGVsZXRlXCI6IDFcbiAgICAgICAgfX0pLmZvckVhY2godXNlciA9PiB7XG4gICAgICAgIHRoaXMuX2RlbGV0ZVNhdmVkVG9rZW5zRm9yVXNlcihcbiAgICAgICAgICB1c2VyLl9pZCxcbiAgICAgICAgICB1c2VyLnNlcnZpY2VzLnJlc3VtZS5sb2dpblRva2Vuc1RvRGVsZXRlXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfTtcblxuICAvLy9cbiAgLy8vIE1BTkFHSU5HIFVTRVIgT0JKRUNUU1xuICAvLy9cblxuICAvLyBVcGRhdGVzIG9yIGNyZWF0ZXMgYSB1c2VyIGFmdGVyIHdlIGF1dGhlbnRpY2F0ZSB3aXRoIGEgM3JkIHBhcnR5LlxuICAvL1xuICAvLyBAcGFyYW0gc2VydmljZU5hbWUge1N0cmluZ30gU2VydmljZSBuYW1lIChlZywgdHdpdHRlcikuXG4gIC8vIEBwYXJhbSBzZXJ2aWNlRGF0YSB7T2JqZWN0fSBEYXRhIHRvIHN0b3JlIGluIHRoZSB1c2VyJ3MgcmVjb3JkXG4gIC8vICAgICAgICB1bmRlciBzZXJ2aWNlc1tzZXJ2aWNlTmFtZV0uIE11c3QgaW5jbHVkZSBhbiBcImlkXCIgZmllbGRcbiAgLy8gICAgICAgIHdoaWNoIGlzIGEgdW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSB1c2VyIGluIHRoZSBzZXJ2aWNlLlxuICAvLyBAcGFyYW0gb3B0aW9ucyB7T2JqZWN0LCBvcHRpb25hbH0gT3RoZXIgb3B0aW9ucyB0byBwYXNzIHRvIGluc2VydFVzZXJEb2NcbiAgLy8gICAgICAgIChlZywgcHJvZmlsZSlcbiAgLy8gQHJldHVybnMge09iamVjdH0gT2JqZWN0IHdpdGggdG9rZW4gYW5kIGlkIGtleXMsIGxpa2UgdGhlIHJlc3VsdFxuICAvLyAgICAgICAgb2YgdGhlIFwibG9naW5cIiBtZXRob2QuXG4gIC8vXG4gIHVwZGF0ZU9yQ3JlYXRlVXNlckZyb21FeHRlcm5hbFNlcnZpY2UoXG4gICAgc2VydmljZU5hbWUsXG4gICAgc2VydmljZURhdGEsXG4gICAgb3B0aW9uc1xuICApIHtcbiAgICBvcHRpb25zID0geyAuLi5vcHRpb25zIH07XG5cbiAgICBpZiAoc2VydmljZU5hbWUgPT09IFwicGFzc3dvcmRcIiB8fCBzZXJ2aWNlTmFtZSA9PT0gXCJyZXN1bWVcIikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIkNhbid0IHVzZSB1cGRhdGVPckNyZWF0ZVVzZXJGcm9tRXh0ZXJuYWxTZXJ2aWNlIHdpdGggaW50ZXJuYWwgc2VydmljZSBcIlxuICAgICAgICArIHNlcnZpY2VOYW1lKTtcbiAgICB9XG4gICAgaWYgKCFoYXNPd24uY2FsbChzZXJ2aWNlRGF0YSwgJ2lkJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYFNlcnZpY2UgZGF0YSBmb3Igc2VydmljZSAke3NlcnZpY2VOYW1lfSBtdXN0IGluY2x1ZGUgaWRgKTtcbiAgICB9XG5cbiAgICAvLyBMb29rIGZvciBhIHVzZXIgd2l0aCB0aGUgYXBwcm9wcmlhdGUgc2VydmljZSB1c2VyIGlkLlxuICAgIGNvbnN0IHNlbGVjdG9yID0ge307XG4gICAgY29uc3Qgc2VydmljZUlkS2V5ID0gYHNlcnZpY2VzLiR7c2VydmljZU5hbWV9LmlkYDtcblxuICAgIC8vIFhYWCBUZW1wb3Jhcnkgc3BlY2lhbCBjYXNlIGZvciBUd2l0dGVyLiAoSXNzdWUgIzYyOSlcbiAgICAvLyAgIFRoZSBzZXJ2aWNlRGF0YS5pZCB3aWxsIGJlIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGFuIGludGVnZXIuXG4gICAgLy8gICBXZSB3YW50IGl0IHRvIG1hdGNoIGVpdGhlciBhIHN0b3JlZCBzdHJpbmcgb3IgaW50IHJlcHJlc2VudGF0aW9uLlxuICAgIC8vICAgVGhpcyBpcyB0byBjYXRlciB0byBlYXJsaWVyIHZlcnNpb25zIG9mIE1ldGVvciBzdG9yaW5nIHR3aXR0ZXJcbiAgICAvLyAgIHVzZXIgSURzIGluIG51bWJlciBmb3JtLCBhbmQgcmVjZW50IHZlcnNpb25zIHN0b3JpbmcgdGhlbSBhcyBzdHJpbmdzLlxuICAgIC8vICAgVGhpcyBjYW4gYmUgcmVtb3ZlZCBvbmNlIG1pZ3JhdGlvbiB0ZWNobm9sb2d5IGlzIGluIHBsYWNlLCBhbmQgdHdpdHRlclxuICAgIC8vICAgdXNlcnMgc3RvcmVkIHdpdGggaW50ZWdlciBJRHMgaGF2ZSBiZWVuIG1pZ3JhdGVkIHRvIHN0cmluZyBJRHMuXG4gICAgaWYgKHNlcnZpY2VOYW1lID09PSBcInR3aXR0ZXJcIiAmJiAhaXNOYU4oc2VydmljZURhdGEuaWQpKSB7XG4gICAgICBzZWxlY3RvcltcIiRvclwiXSA9IFt7fSx7fV07XG4gICAgICBzZWxlY3RvcltcIiRvclwiXVswXVtzZXJ2aWNlSWRLZXldID0gc2VydmljZURhdGEuaWQ7XG4gICAgICBzZWxlY3RvcltcIiRvclwiXVsxXVtzZXJ2aWNlSWRLZXldID0gcGFyc2VJbnQoc2VydmljZURhdGEuaWQsIDEwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2VsZWN0b3Jbc2VydmljZUlkS2V5XSA9IHNlcnZpY2VEYXRhLmlkO1xuICAgIH1cblxuICAgIGxldCB1c2VyID0gdGhpcy51c2Vycy5maW5kT25lKHNlbGVjdG9yLCB7ZmllbGRzOiB0aGlzLl9vcHRpb25zLmRlZmF1bHRGaWVsZFNlbGVjdG9yfSk7XG5cbiAgICAvLyBDaGVjayB0byBzZWUgaWYgdGhlIGRldmVsb3BlciBoYXMgYSBjdXN0b20gd2F5IHRvIGZpbmQgdGhlIHVzZXIgb3V0c2lkZVxuICAgIC8vIG9mIHRoZSBnZW5lcmFsIHNlbGVjdG9ycyBhYm92ZS5cbiAgICBpZiAoIXVzZXIgJiYgdGhpcy5fYWRkaXRpb25hbEZpbmRVc2VyT25FeHRlcm5hbExvZ2luKSB7XG4gICAgICB1c2VyID0gdGhpcy5fYWRkaXRpb25hbEZpbmRVc2VyT25FeHRlcm5hbExvZ2luKHtzZXJ2aWNlTmFtZSwgc2VydmljZURhdGEsIG9wdGlvbnN9KVxuICAgIH1cblxuICAgIC8vIEJlZm9yZSBjb250aW51aW5nLCBydW4gdXNlciBob29rIHRvIHNlZSBpZiB3ZSBzaG91bGQgY29udGludWVcbiAgICBpZiAodGhpcy5fYmVmb3JlRXh0ZXJuYWxMb2dpbkhvb2sgJiYgIXRoaXMuX2JlZm9yZUV4dGVybmFsTG9naW5Ib29rKHNlcnZpY2VOYW1lLCBzZXJ2aWNlRGF0YSwgdXNlcikpIHtcbiAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBcIkxvZ2luIGZvcmJpZGRlblwiKTtcbiAgICB9XG5cbiAgICAvLyBXaGVuIGNyZWF0aW5nIGEgbmV3IHVzZXIgd2UgcGFzcyB0aHJvdWdoIGFsbCBvcHRpb25zLiBXaGVuIHVwZGF0aW5nIGFuXG4gICAgLy8gZXhpc3RpbmcgdXNlciwgYnkgZGVmYXVsdCB3ZSBvbmx5IHByb2Nlc3MvcGFzcyB0aHJvdWdoIHRoZSBzZXJ2aWNlRGF0YVxuICAgIC8vIChlZywgc28gdGhhdCB3ZSBrZWVwIGFuIHVuZXhwaXJlZCBhY2Nlc3MgdG9rZW4gYW5kIGRvbid0IGNhY2hlIG9sZCBlbWFpbFxuICAgIC8vIGFkZHJlc3NlcyBpbiBzZXJ2aWNlRGF0YS5lbWFpbCkuIFRoZSBvbkV4dGVybmFsTG9naW4gaG9vayBjYW4gYmUgdXNlZCB3aGVuXG4gICAgLy8gY3JlYXRpbmcgb3IgdXBkYXRpbmcgYSB1c2VyLCB0byBtb2RpZnkgb3IgcGFzcyB0aHJvdWdoIG1vcmUgb3B0aW9ucyBhc1xuICAgIC8vIG5lZWRlZC5cbiAgICBsZXQgb3B0cyA9IHVzZXIgPyB7fSA6IG9wdGlvbnM7XG4gICAgaWYgKHRoaXMuX29uRXh0ZXJuYWxMb2dpbkhvb2spIHtcbiAgICAgIG9wdHMgPSB0aGlzLl9vbkV4dGVybmFsTG9naW5Ib29rKG9wdGlvbnMsIHVzZXIpO1xuICAgIH1cblxuICAgIGlmICh1c2VyKSB7XG4gICAgICBwaW5FbmNyeXB0ZWRGaWVsZHNUb1VzZXIoc2VydmljZURhdGEsIHVzZXIuX2lkKTtcblxuICAgICAgbGV0IHNldEF0dHJzID0ge307XG4gICAgICBPYmplY3Qua2V5cyhzZXJ2aWNlRGF0YSkuZm9yRWFjaChrZXkgPT5cbiAgICAgICAgc2V0QXR0cnNbYHNlcnZpY2VzLiR7c2VydmljZU5hbWV9LiR7a2V5fWBdID0gc2VydmljZURhdGFba2V5XVxuICAgICAgKTtcblxuICAgICAgLy8gWFhYIE1heWJlIHdlIHNob3VsZCByZS11c2UgdGhlIHNlbGVjdG9yIGFib3ZlIGFuZCBub3RpY2UgaWYgdGhlIHVwZGF0ZVxuICAgICAgLy8gICAgIHRvdWNoZXMgbm90aGluZz9cbiAgICAgIHNldEF0dHJzID0geyAuLi5zZXRBdHRycywgLi4ub3B0cyB9O1xuICAgICAgdGhpcy51c2Vycy51cGRhdGUodXNlci5faWQsIHtcbiAgICAgICAgJHNldDogc2V0QXR0cnNcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICB0eXBlOiBzZXJ2aWNlTmFtZSxcbiAgICAgICAgdXNlcklkOiB1c2VyLl9pZFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIGEgbmV3IHVzZXIgd2l0aCB0aGUgc2VydmljZSBkYXRhLlxuICAgICAgdXNlciA9IHtzZXJ2aWNlczoge319O1xuICAgICAgdXNlci5zZXJ2aWNlc1tzZXJ2aWNlTmFtZV0gPSBzZXJ2aWNlRGF0YTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHR5cGU6IHNlcnZpY2VOYW1lLFxuICAgICAgICB1c2VySWQ6IHRoaXMuaW5zZXJ0VXNlckRvYyhvcHRzLCB1c2VyKVxuICAgICAgfTtcbiAgICB9XG4gIH07XG5cbiAgLy8gUmVtb3ZlcyBkZWZhdWx0IHJhdGUgbGltaXRpbmcgcnVsZVxuICByZW1vdmVEZWZhdWx0UmF0ZUxpbWl0KCkge1xuICAgIGNvbnN0IHJlc3AgPSBERFBSYXRlTGltaXRlci5yZW1vdmVSdWxlKHRoaXMuZGVmYXVsdFJhdGVMaW1pdGVyUnVsZUlkKTtcbiAgICB0aGlzLmRlZmF1bHRSYXRlTGltaXRlclJ1bGVJZCA9IG51bGw7XG4gICAgcmV0dXJuIHJlc3A7XG4gIH07XG5cbiAgLy8gQWRkIGEgZGVmYXVsdCBydWxlIG9mIGxpbWl0aW5nIGxvZ2lucywgY3JlYXRpbmcgbmV3IHVzZXJzIGFuZCBwYXNzd29yZCByZXNldFxuICAvLyB0byA1IHRpbWVzIGV2ZXJ5IDEwIHNlY29uZHMgcGVyIGNvbm5lY3Rpb24uXG4gIGFkZERlZmF1bHRSYXRlTGltaXQoKSB7XG4gICAgaWYgKCF0aGlzLmRlZmF1bHRSYXRlTGltaXRlclJ1bGVJZCkge1xuICAgICAgdGhpcy5kZWZhdWx0UmF0ZUxpbWl0ZXJSdWxlSWQgPSBERFBSYXRlTGltaXRlci5hZGRSdWxlKHtcbiAgICAgICAgdXNlcklkOiBudWxsLFxuICAgICAgICBjbGllbnRBZGRyZXNzOiBudWxsLFxuICAgICAgICB0eXBlOiAnbWV0aG9kJyxcbiAgICAgICAgbmFtZTogbmFtZSA9PiBbJ2xvZ2luJywgJ2NyZWF0ZVVzZXInLCAncmVzZXRQYXNzd29yZCcsICdmb3Jnb3RQYXNzd29yZCddXG4gICAgICAgICAgLmluY2x1ZGVzKG5hbWUpLFxuICAgICAgICBjb25uZWN0aW9uSWQ6IChjb25uZWN0aW9uSWQpID0+IHRydWUsXG4gICAgICB9LCA1LCAxMDAwMCk7XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAgKiBAc3VtbWFyeSBDcmVhdGVzIG9wdGlvbnMgZm9yIGVtYWlsIHNlbmRpbmcgZm9yIHJlc2V0IHBhc3N3b3JkIGFuZCBlbnJvbGwgYWNjb3VudCBlbWFpbHMuXG4gICAqIFlvdSBjYW4gdXNlIHRoaXMgZnVuY3Rpb24gd2hlbiBjdXN0b21pemluZyBhIHJlc2V0IHBhc3N3b3JkIG9yIGVucm9sbCBhY2NvdW50IGVtYWlsIHNlbmRpbmcuXG4gICAqIEBsb2N1cyBTZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IGVtYWlsIFdoaWNoIGFkZHJlc3Mgb2YgdGhlIHVzZXIncyB0byBzZW5kIHRoZSBlbWFpbCB0by5cbiAgICogQHBhcmFtIHtPYmplY3R9IHVzZXIgVGhlIHVzZXIgb2JqZWN0IHRvIGdlbmVyYXRlIG9wdGlvbnMgZm9yLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gdXJsIFVSTCB0byB3aGljaCB1c2VyIGlzIGRpcmVjdGVkIHRvIGNvbmZpcm0gdGhlIGVtYWlsLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcmVhc29uIGByZXNldFBhc3N3b3JkYCBvciBgZW5yb2xsQWNjb3VudGAuXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IE9wdGlvbnMgd2hpY2ggY2FuIGJlIHBhc3NlZCB0byBgRW1haWwuc2VuZGAuXG4gICAqIEBpbXBvcnRGcm9tUGFja2FnZSBhY2NvdW50cy1iYXNlXG4gICAqL1xuICBnZW5lcmF0ZU9wdGlvbnNGb3JFbWFpbChlbWFpbCwgdXNlciwgdXJsLCByZWFzb24sIGV4dHJhID0ge30pe1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICB0bzogZW1haWwsXG4gICAgICBmcm9tOiB0aGlzLmVtYWlsVGVtcGxhdGVzW3JlYXNvbl0uZnJvbVxuICAgICAgICA/IHRoaXMuZW1haWxUZW1wbGF0ZXNbcmVhc29uXS5mcm9tKHVzZXIpXG4gICAgICAgIDogdGhpcy5lbWFpbFRlbXBsYXRlcy5mcm9tLFxuICAgICAgc3ViamVjdDogdGhpcy5lbWFpbFRlbXBsYXRlc1tyZWFzb25dLnN1YmplY3QodXNlciwgdXJsLCBleHRyYSksXG4gICAgfTtcblxuICAgIGlmICh0eXBlb2YgdGhpcy5lbWFpbFRlbXBsYXRlc1tyZWFzb25dLnRleHQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIG9wdGlvbnMudGV4dCA9IHRoaXMuZW1haWxUZW1wbGF0ZXNbcmVhc29uXS50ZXh0KHVzZXIsIHVybCwgZXh0cmEpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgdGhpcy5lbWFpbFRlbXBsYXRlc1tyZWFzb25dLmh0bWwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIG9wdGlvbnMuaHRtbCA9IHRoaXMuZW1haWxUZW1wbGF0ZXNbcmVhc29uXS5odG1sKHVzZXIsIHVybCwgZXh0cmEpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgdGhpcy5lbWFpbFRlbXBsYXRlcy5oZWFkZXJzID09PSAnb2JqZWN0Jykge1xuICAgICAgb3B0aW9ucy5oZWFkZXJzID0gdGhpcy5lbWFpbFRlbXBsYXRlcy5oZWFkZXJzO1xuICAgIH1cblxuICAgIHJldHVybiBvcHRpb25zO1xuICB9O1xuXG4gIF9jaGVja0ZvckNhc2VJbnNlbnNpdGl2ZUR1cGxpY2F0ZXMoXG4gICAgZmllbGROYW1lLFxuICAgIGRpc3BsYXlOYW1lLFxuICAgIGZpZWxkVmFsdWUsXG4gICAgb3duVXNlcklkXG4gICkge1xuICAgIC8vIFNvbWUgdGVzdHMgbmVlZCB0aGUgYWJpbGl0eSB0byBhZGQgdXNlcnMgd2l0aCB0aGUgc2FtZSBjYXNlIGluc2Vuc2l0aXZlXG4gICAgLy8gdmFsdWUsIGhlbmNlIHRoZSBfc2tpcENhc2VJbnNlbnNpdGl2ZUNoZWNrc0ZvclRlc3QgY2hlY2tcbiAgICBjb25zdCBza2lwQ2hlY2sgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoXG4gICAgICB0aGlzLl9za2lwQ2FzZUluc2Vuc2l0aXZlQ2hlY2tzRm9yVGVzdCxcbiAgICAgIGZpZWxkVmFsdWVcbiAgICApO1xuXG4gICAgaWYgKGZpZWxkVmFsdWUgJiYgIXNraXBDaGVjaykge1xuICAgICAgY29uc3QgbWF0Y2hlZFVzZXJzID0gTWV0ZW9yLnVzZXJzXG4gICAgICAgIC5maW5kKFxuICAgICAgICAgIHRoaXMuX3NlbGVjdG9yRm9yRmFzdENhc2VJbnNlbnNpdGl2ZUxvb2t1cChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGZpZWxkczogeyBfaWQ6IDEgfSxcbiAgICAgICAgICAgIC8vIHdlIG9ubHkgbmVlZCBhIG1heGltdW0gb2YgMiB1c2VycyBmb3IgdGhlIGxvZ2ljIGJlbG93IHRvIHdvcmtcbiAgICAgICAgICAgIGxpbWl0OiAyLFxuICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgICAgICAuZmV0Y2goKTtcblxuICAgICAgaWYgKFxuICAgICAgICBtYXRjaGVkVXNlcnMubGVuZ3RoID4gMCAmJlxuICAgICAgICAvLyBJZiB3ZSBkb24ndCBoYXZlIGEgdXNlcklkIHlldCwgYW55IG1hdGNoIHdlIGZpbmQgaXMgYSBkdXBsaWNhdGVcbiAgICAgICAgKCFvd25Vc2VySWQgfHxcbiAgICAgICAgICAvLyBPdGhlcndpc2UsIGNoZWNrIHRvIHNlZSBpZiB0aGVyZSBhcmUgbXVsdGlwbGUgbWF0Y2hlcyBvciBhIG1hdGNoXG4gICAgICAgICAgLy8gdGhhdCBpcyBub3QgdXNcbiAgICAgICAgICBtYXRjaGVkVXNlcnMubGVuZ3RoID4gMSB8fCBtYXRjaGVkVXNlcnNbMF0uX2lkICE9PSBvd25Vc2VySWQpXG4gICAgICApIHtcbiAgICAgICAgdGhpcy5faGFuZGxlRXJyb3IoYCR7ZGlzcGxheU5hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBfY3JlYXRlVXNlckNoZWNraW5nRHVwbGljYXRlcyh7IHVzZXIsIGVtYWlsLCB1c2VybmFtZSwgb3B0aW9ucyB9KSB7XG4gICAgY29uc3QgbmV3VXNlciA9IHtcbiAgICAgIC4uLnVzZXIsXG4gICAgICAuLi4odXNlcm5hbWUgPyB7IHVzZXJuYW1lIH0gOiB7fSksXG4gICAgICAuLi4oZW1haWwgPyB7IGVtYWlsczogW3sgYWRkcmVzczogZW1haWwsIHZlcmlmaWVkOiBmYWxzZSB9XSB9IDoge30pLFxuICAgIH07XG5cbiAgICAvLyBQZXJmb3JtIGEgY2FzZSBpbnNlbnNpdGl2ZSBjaGVjayBiZWZvcmUgaW5zZXJ0XG4gICAgdGhpcy5fY2hlY2tGb3JDYXNlSW5zZW5zaXRpdmVEdXBsaWNhdGVzKCd1c2VybmFtZScsICdVc2VybmFtZScsIHVzZXJuYW1lKTtcbiAgICB0aGlzLl9jaGVja0ZvckNhc2VJbnNlbnNpdGl2ZUR1cGxpY2F0ZXMoJ2VtYWlscy5hZGRyZXNzJywgJ0VtYWlsJywgZW1haWwpO1xuXG4gICAgY29uc3QgdXNlcklkID0gdGhpcy5pbnNlcnRVc2VyRG9jKG9wdGlvbnMsIG5ld1VzZXIpO1xuICAgIC8vIFBlcmZvcm0gYW5vdGhlciBjaGVjayBhZnRlciBpbnNlcnQsIGluIGNhc2UgYSBtYXRjaGluZyB1c2VyIGhhcyBiZWVuXG4gICAgLy8gaW5zZXJ0ZWQgaW4gdGhlIG1lYW50aW1lXG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuX2NoZWNrRm9yQ2FzZUluc2Vuc2l0aXZlRHVwbGljYXRlcygndXNlcm5hbWUnLCAnVXNlcm5hbWUnLCB1c2VybmFtZSwgdXNlcklkKTtcbiAgICAgIHRoaXMuX2NoZWNrRm9yQ2FzZUluc2Vuc2l0aXZlRHVwbGljYXRlcygnZW1haWxzLmFkZHJlc3MnLCAnRW1haWwnLCBlbWFpbCwgdXNlcklkKTtcbiAgICB9IGNhdGNoIChleCkge1xuICAgICAgLy8gUmVtb3ZlIGluc2VydGVkIHVzZXIgaWYgdGhlIGNoZWNrIGZhaWxzXG4gICAgICBNZXRlb3IudXNlcnMucmVtb3ZlKHVzZXJJZCk7XG4gICAgICB0aHJvdyBleDtcbiAgICB9XG4gICAgcmV0dXJuIHVzZXJJZDtcbiAgfVxuXG4gIF9oYW5kbGVFcnJvciA9IChtc2csIHRocm93RXJyb3IgPSB0cnVlLCBlcnJvckNvZGUgPSA0MDMpID0+IHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBNZXRlb3IuRXJyb3IoXG4gICAgICBlcnJvckNvZGUsXG4gICAgICB0aGlzLl9vcHRpb25zLmFtYmlndW91c0Vycm9yTWVzc2FnZXNcbiAgICAgICAgPyBcIlNvbWV0aGluZyB3ZW50IHdyb25nLiBQbGVhc2UgY2hlY2sgeW91ciBjcmVkZW50aWFscy5cIlxuICAgICAgICA6IG1zZ1xuICAgICk7XG4gICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgICByZXR1cm4gZXJyb3I7XG4gIH1cblxuICBfdXNlclF1ZXJ5VmFsaWRhdG9yID0gTWF0Y2guV2hlcmUodXNlciA9PiB7XG4gICAgY2hlY2sodXNlciwge1xuICAgICAgaWQ6IE1hdGNoLk9wdGlvbmFsKE5vbkVtcHR5U3RyaW5nKSxcbiAgICAgIHVzZXJuYW1lOiBNYXRjaC5PcHRpb25hbChOb25FbXB0eVN0cmluZyksXG4gICAgICBlbWFpbDogTWF0Y2guT3B0aW9uYWwoTm9uRW1wdHlTdHJpbmcpXG4gICAgfSk7XG4gICAgaWYgKE9iamVjdC5rZXlzKHVzZXIpLmxlbmd0aCAhPT0gMSlcbiAgICAgIHRocm93IG5ldyBNYXRjaC5FcnJvcihcIlVzZXIgcHJvcGVydHkgbXVzdCBoYXZlIGV4YWN0bHkgb25lIGZpZWxkXCIpO1xuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxufVxuXG4vLyBHaXZlIGVhY2ggbG9naW4gaG9vayBjYWxsYmFjayBhIGZyZXNoIGNsb25lZCBjb3B5IG9mIHRoZSBhdHRlbXB0XG4vLyBvYmplY3QsIGJ1dCBkb24ndCBjbG9uZSB0aGUgY29ubmVjdGlvbi5cbi8vXG5jb25zdCBjbG9uZUF0dGVtcHRXaXRoQ29ubmVjdGlvbiA9IChjb25uZWN0aW9uLCBhdHRlbXB0KSA9PiB7XG4gIGNvbnN0IGNsb25lZEF0dGVtcHQgPSBFSlNPTi5jbG9uZShhdHRlbXB0KTtcbiAgY2xvbmVkQXR0ZW1wdC5jb25uZWN0aW9uID0gY29ubmVjdGlvbjtcbiAgcmV0dXJuIGNsb25lZEF0dGVtcHQ7XG59O1xuXG5jb25zdCB0cnlMb2dpbk1ldGhvZCA9IGFzeW5jICh0eXBlLCBmbikgPT4ge1xuICBsZXQgcmVzdWx0O1xuICB0cnkge1xuICAgIHJlc3VsdCA9IGF3YWl0IGZuKCk7XG4gIH1cbiAgY2F0Y2ggKGUpIHtcbiAgICByZXN1bHQgPSB7ZXJyb3I6IGV9O1xuICB9XG5cbiAgaWYgKHJlc3VsdCAmJiAhcmVzdWx0LnR5cGUgJiYgdHlwZSlcbiAgICByZXN1bHQudHlwZSA9IHR5cGU7XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbmNvbnN0IHNldHVwRGVmYXVsdExvZ2luSGFuZGxlcnMgPSBhY2NvdW50cyA9PiB7XG4gIGFjY291bnRzLnJlZ2lzdGVyTG9naW5IYW5kbGVyKFwicmVzdW1lXCIsIGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgcmV0dXJuIGRlZmF1bHRSZXN1bWVMb2dpbkhhbmRsZXIuY2FsbCh0aGlzLCBhY2NvdW50cywgb3B0aW9ucyk7XG4gIH0pO1xufTtcblxuLy8gTG9naW4gaGFuZGxlciBmb3IgcmVzdW1lIHRva2Vucy5cbmNvbnN0IGRlZmF1bHRSZXN1bWVMb2dpbkhhbmRsZXIgPSAoYWNjb3VudHMsIG9wdGlvbnMpID0+IHtcbiAgaWYgKCFvcHRpb25zLnJlc3VtZSlcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuXG4gIGNoZWNrKG9wdGlvbnMucmVzdW1lLCBTdHJpbmcpO1xuXG4gIGNvbnN0IGhhc2hlZFRva2VuID0gYWNjb3VudHMuX2hhc2hMb2dpblRva2VuKG9wdGlvbnMucmVzdW1lKTtcblxuICAvLyBGaXJzdCBsb29rIGZvciBqdXN0IHRoZSBuZXctc3R5bGUgaGFzaGVkIGxvZ2luIHRva2VuLCB0byBhdm9pZFxuICAvLyBzZW5kaW5nIHRoZSB1bmhhc2hlZCB0b2tlbiB0byB0aGUgZGF0YWJhc2UgaW4gYSBxdWVyeSBpZiB3ZSBkb24ndFxuICAvLyBuZWVkIHRvLlxuICBsZXQgdXNlciA9IGFjY291bnRzLnVzZXJzLmZpbmRPbmUoXG4gICAge1wic2VydmljZXMucmVzdW1lLmxvZ2luVG9rZW5zLmhhc2hlZFRva2VuXCI6IGhhc2hlZFRva2VufSxcbiAgICB7ZmllbGRzOiB7XCJzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnMuJFwiOiAxfX0pO1xuXG4gIGlmICghIHVzZXIpIHtcbiAgICAvLyBJZiB3ZSBkaWRuJ3QgZmluZCB0aGUgaGFzaGVkIGxvZ2luIHRva2VuLCB0cnkgYWxzbyBsb29raW5nIGZvclxuICAgIC8vIHRoZSBvbGQtc3R5bGUgdW5oYXNoZWQgdG9rZW4uICBCdXQgd2UgbmVlZCB0byBsb29rIGZvciBlaXRoZXJcbiAgICAvLyB0aGUgb2xkLXN0eWxlIHRva2VuIE9SIHRoZSBuZXctc3R5bGUgdG9rZW4sIGJlY2F1c2UgYW5vdGhlclxuICAgIC8vIGNsaWVudCBjb25uZWN0aW9uIGxvZ2dpbmcgaW4gc2ltdWx0YW5lb3VzbHkgbWlnaHQgaGF2ZSBhbHJlYWR5XG4gICAgLy8gY29udmVydGVkIHRoZSB0b2tlbi5cbiAgICB1c2VyID0gYWNjb3VudHMudXNlcnMuZmluZE9uZSh7XG4gICAgICAgICRvcjogW1xuICAgICAgICAgIHtcInNlcnZpY2VzLnJlc3VtZS5sb2dpblRva2Vucy5oYXNoZWRUb2tlblwiOiBoYXNoZWRUb2tlbn0sXG4gICAgICAgICAge1wic2VydmljZXMucmVzdW1lLmxvZ2luVG9rZW5zLnRva2VuXCI6IG9wdGlvbnMucmVzdW1lfVxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgLy8gTm90ZTogQ2Fubm90IHVzZSAuLi5sb2dpblRva2Vucy4kIHBvc2l0aW9uYWwgb3BlcmF0b3Igd2l0aCAkb3IgcXVlcnkuXG4gICAgICB7ZmllbGRzOiB7XCJzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnNcIjogMX19KTtcbiAgfVxuXG4gIGlmICghIHVzZXIpXG4gICAgcmV0dXJuIHtcbiAgICAgIGVycm9yOiBuZXcgTWV0ZW9yLkVycm9yKDQwMywgXCJZb3UndmUgYmVlbiBsb2dnZWQgb3V0IGJ5IHRoZSBzZXJ2ZXIuIFBsZWFzZSBsb2cgaW4gYWdhaW4uXCIpXG4gICAgfTtcblxuICAvLyBGaW5kIHRoZSB0b2tlbiwgd2hpY2ggd2lsbCBlaXRoZXIgYmUgYW4gb2JqZWN0IHdpdGggZmllbGRzXG4gIC8vIHtoYXNoZWRUb2tlbiwgd2hlbn0gZm9yIGEgaGFzaGVkIHRva2VuIG9yIHt0b2tlbiwgd2hlbn0gZm9yIGFuXG4gIC8vIHVuaGFzaGVkIHRva2VuLlxuICBsZXQgb2xkVW5oYXNoZWRTdHlsZVRva2VuO1xuICBsZXQgdG9rZW4gPSB1c2VyLnNlcnZpY2VzLnJlc3VtZS5sb2dpblRva2Vucy5maW5kKHRva2VuID0+XG4gICAgdG9rZW4uaGFzaGVkVG9rZW4gPT09IGhhc2hlZFRva2VuXG4gICk7XG4gIGlmICh0b2tlbikge1xuICAgIG9sZFVuaGFzaGVkU3R5bGVUb2tlbiA9IGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHRva2VuID0gdXNlci5zZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnMuZmluZCh0b2tlbiA9PlxuICAgICAgdG9rZW4udG9rZW4gPT09IG9wdGlvbnMucmVzdW1lXG4gICAgKTtcbiAgICBvbGRVbmhhc2hlZFN0eWxlVG9rZW4gPSB0cnVlO1xuICB9XG5cbiAgY29uc3QgdG9rZW5FeHBpcmVzID0gYWNjb3VudHMuX3Rva2VuRXhwaXJhdGlvbih0b2tlbi53aGVuKTtcbiAgaWYgKG5ldyBEYXRlKCkgPj0gdG9rZW5FeHBpcmVzKVxuICAgIHJldHVybiB7XG4gICAgICB1c2VySWQ6IHVzZXIuX2lkLFxuICAgICAgZXJyb3I6IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBcIllvdXIgc2Vzc2lvbiBoYXMgZXhwaXJlZC4gUGxlYXNlIGxvZyBpbiBhZ2Fpbi5cIilcbiAgICB9O1xuXG4gIC8vIFVwZGF0ZSB0byBhIGhhc2hlZCB0b2tlbiB3aGVuIGFuIHVuaGFzaGVkIHRva2VuIGlzIGVuY291bnRlcmVkLlxuICBpZiAob2xkVW5oYXNoZWRTdHlsZVRva2VuKSB7XG4gICAgLy8gT25seSBhZGQgdGhlIG5ldyBoYXNoZWQgdG9rZW4gaWYgdGhlIG9sZCB1bmhhc2hlZCB0b2tlbiBzdGlsbFxuICAgIC8vIGV4aXN0cyAodGhpcyBhdm9pZHMgcmVzdXJyZWN0aW5nIHRoZSB0b2tlbiBpZiBpdCB3YXMgZGVsZXRlZFxuICAgIC8vIGFmdGVyIHdlIHJlYWQgaXQpLiAgVXNpbmcgJGFkZFRvU2V0IGF2b2lkcyBnZXR0aW5nIGFuIGluZGV4XG4gICAgLy8gZXJyb3IgaWYgYW5vdGhlciBjbGllbnQgbG9nZ2luZyBpbiBzaW11bHRhbmVvdXNseSBoYXMgYWxyZWFkeVxuICAgIC8vIGluc2VydGVkIHRoZSBuZXcgaGFzaGVkIHRva2VuLlxuICAgIGFjY291bnRzLnVzZXJzLnVwZGF0ZShcbiAgICAgIHtcbiAgICAgICAgX2lkOiB1c2VyLl9pZCxcbiAgICAgICAgXCJzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnMudG9rZW5cIjogb3B0aW9ucy5yZXN1bWVcbiAgICAgIH0sXG4gICAgICB7JGFkZFRvU2V0OiB7XG4gICAgICAgICAgXCJzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnNcIjoge1xuICAgICAgICAgICAgXCJoYXNoZWRUb2tlblwiOiBoYXNoZWRUb2tlbixcbiAgICAgICAgICAgIFwid2hlblwiOiB0b2tlbi53aGVuXG4gICAgICAgICAgfVxuICAgICAgICB9fVxuICAgICk7XG5cbiAgICAvLyBSZW1vdmUgdGhlIG9sZCB0b2tlbiAqYWZ0ZXIqIGFkZGluZyB0aGUgbmV3LCBzaW5jZSBvdGhlcndpc2VcbiAgICAvLyBhbm90aGVyIGNsaWVudCB0cnlpbmcgdG8gbG9naW4gYmV0d2VlbiBvdXIgcmVtb3ZpbmcgdGhlIG9sZCBhbmRcbiAgICAvLyBhZGRpbmcgdGhlIG5ldyB3b3VsZG4ndCBmaW5kIGEgdG9rZW4gdG8gbG9naW4gd2l0aC5cbiAgICBhY2NvdW50cy51c2Vycy51cGRhdGUodXNlci5faWQsIHtcbiAgICAgICRwdWxsOiB7XG4gICAgICAgIFwic2VydmljZXMucmVzdW1lLmxvZ2luVG9rZW5zXCI6IHsgXCJ0b2tlblwiOiBvcHRpb25zLnJlc3VtZSB9XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHVzZXJJZDogdXNlci5faWQsXG4gICAgc3RhbXBlZExvZ2luVG9rZW46IHtcbiAgICAgIHRva2VuOiBvcHRpb25zLnJlc3VtZSxcbiAgICAgIHdoZW46IHRva2VuLndoZW5cbiAgICB9XG4gIH07XG59O1xuXG5jb25zdCBleHBpcmVQYXNzd29yZFRva2VuID0gKFxuICBhY2NvdW50cyxcbiAgb2xkZXN0VmFsaWREYXRlLFxuICB0b2tlbkZpbHRlcixcbiAgdXNlcklkXG4pID0+IHtcbiAgLy8gYm9vbGVhbiB2YWx1ZSB1c2VkIHRvIGRldGVybWluZSBpZiB0aGlzIG1ldGhvZCB3YXMgY2FsbGVkIGZyb20gZW5yb2xsIGFjY291bnQgd29ya2Zsb3dcbiAgbGV0IGlzRW5yb2xsID0gZmFsc2U7XG4gIGNvbnN0IHVzZXJGaWx0ZXIgPSB1c2VySWQgPyB7X2lkOiB1c2VySWR9IDoge307XG4gIC8vIGNoZWNrIGlmIHRoaXMgbWV0aG9kIHdhcyBjYWxsZWQgZnJvbSBlbnJvbGwgYWNjb3VudCB3b3JrZmxvd1xuICBpZih0b2tlbkZpbHRlclsnc2VydmljZXMucGFzc3dvcmQuZW5yb2xsLnJlYXNvbiddKSB7XG4gICAgaXNFbnJvbGwgPSB0cnVlO1xuICB9XG4gIGxldCByZXNldFJhbmdlT3IgPSB7XG4gICAgJG9yOiBbXG4gICAgICB7IFwic2VydmljZXMucGFzc3dvcmQucmVzZXQud2hlblwiOiB7ICRsdDogb2xkZXN0VmFsaWREYXRlIH0gfSxcbiAgICAgIHsgXCJzZXJ2aWNlcy5wYXNzd29yZC5yZXNldC53aGVuXCI6IHsgJGx0OiArb2xkZXN0VmFsaWREYXRlIH0gfVxuICAgIF1cbiAgfTtcbiAgaWYoaXNFbnJvbGwpIHtcbiAgICByZXNldFJhbmdlT3IgPSB7XG4gICAgICAkb3I6IFtcbiAgICAgICAgeyBcInNlcnZpY2VzLnBhc3N3b3JkLmVucm9sbC53aGVuXCI6IHsgJGx0OiBvbGRlc3RWYWxpZERhdGUgfSB9LFxuICAgICAgICB7IFwic2VydmljZXMucGFzc3dvcmQuZW5yb2xsLndoZW5cIjogeyAkbHQ6ICtvbGRlc3RWYWxpZERhdGUgfSB9XG4gICAgICBdXG4gICAgfTtcbiAgfVxuICBjb25zdCBleHBpcmVGaWx0ZXIgPSB7ICRhbmQ6IFt0b2tlbkZpbHRlciwgcmVzZXRSYW5nZU9yXSB9O1xuICBpZihpc0Vucm9sbCkge1xuICAgIGFjY291bnRzLnVzZXJzLnVwZGF0ZSh7Li4udXNlckZpbHRlciwgLi4uZXhwaXJlRmlsdGVyfSwge1xuICAgICAgJHVuc2V0OiB7XG4gICAgICAgIFwic2VydmljZXMucGFzc3dvcmQuZW5yb2xsXCI6IFwiXCJcbiAgICAgIH1cbiAgICB9LCB7IG11bHRpOiB0cnVlIH0pO1xuICB9IGVsc2Uge1xuICAgIGFjY291bnRzLnVzZXJzLnVwZGF0ZSh7Li4udXNlckZpbHRlciwgLi4uZXhwaXJlRmlsdGVyfSwge1xuICAgICAgJHVuc2V0OiB7XG4gICAgICAgIFwic2VydmljZXMucGFzc3dvcmQucmVzZXRcIjogXCJcIlxuICAgICAgfVxuICAgIH0sIHsgbXVsdGk6IHRydWUgfSk7XG4gIH1cblxufTtcblxuY29uc3Qgc2V0RXhwaXJlVG9rZW5zSW50ZXJ2YWwgPSBhY2NvdW50cyA9PiB7XG4gIGFjY291bnRzLmV4cGlyZVRva2VuSW50ZXJ2YWwgPSBNZXRlb3Iuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgIGFjY291bnRzLl9leHBpcmVUb2tlbnMoKTtcbiAgICBhY2NvdW50cy5fZXhwaXJlUGFzc3dvcmRSZXNldFRva2VucygpO1xuICAgIGFjY291bnRzLl9leHBpcmVQYXNzd29yZEVucm9sbFRva2VucygpO1xuICB9LCBFWFBJUkVfVE9LRU5TX0lOVEVSVkFMX01TKTtcbn07XG5cbmNvbnN0IE9BdXRoRW5jcnlwdGlvbiA9IFBhY2thZ2VbXCJvYXV0aC1lbmNyeXB0aW9uXCJdPy5PQXV0aEVuY3J5cHRpb247XG5cbi8vIE9BdXRoIHNlcnZpY2UgZGF0YSBpcyB0ZW1wb3JhcmlseSBzdG9yZWQgaW4gdGhlIHBlbmRpbmcgY3JlZGVudGlhbHNcbi8vIGNvbGxlY3Rpb24gZHVyaW5nIHRoZSBvYXV0aCBhdXRoZW50aWNhdGlvbiBwcm9jZXNzLiAgU2Vuc2l0aXZlIGRhdGFcbi8vIHN1Y2ggYXMgYWNjZXNzIHRva2VucyBhcmUgZW5jcnlwdGVkIHdpdGhvdXQgdGhlIHVzZXIgaWQgYmVjYXVzZVxuLy8gd2UgZG9uJ3Qga25vdyB0aGUgdXNlciBpZCB5ZXQuICBXZSByZS1lbmNyeXB0IHRoZXNlIGZpZWxkcyB3aXRoIHRoZVxuLy8gdXNlciBpZCBpbmNsdWRlZCB3aGVuIHN0b3JpbmcgdGhlIHNlcnZpY2UgZGF0YSBwZXJtYW5lbnRseSBpblxuLy8gdGhlIHVzZXJzIGNvbGxlY3Rpb24uXG4vL1xuY29uc3QgcGluRW5jcnlwdGVkRmllbGRzVG9Vc2VyID0gKHNlcnZpY2VEYXRhLCB1c2VySWQpID0+IHtcbiAgT2JqZWN0LmtleXMoc2VydmljZURhdGEpLmZvckVhY2goa2V5ID0+IHtcbiAgICBsZXQgdmFsdWUgPSBzZXJ2aWNlRGF0YVtrZXldO1xuICAgIGlmIChPQXV0aEVuY3J5cHRpb24/LmlzU2VhbGVkKHZhbHVlKSlcbiAgICAgIHZhbHVlID0gT0F1dGhFbmNyeXB0aW9uLnNlYWwoT0F1dGhFbmNyeXB0aW9uLm9wZW4odmFsdWUpLCB1c2VySWQpO1xuICAgIHNlcnZpY2VEYXRhW2tleV0gPSB2YWx1ZTtcbiAgfSk7XG59O1xuXG4vLyBYWFggc2VlIGNvbW1lbnQgb24gQWNjb3VudHMuY3JlYXRlVXNlciBpbiBwYXNzd29yZHNfc2VydmVyIGFib3V0IGFkZGluZyBhXG4vLyBzZWNvbmQgXCJzZXJ2ZXIgb3B0aW9uc1wiIGFyZ3VtZW50LlxuY29uc3QgZGVmYXVsdENyZWF0ZVVzZXJIb29rID0gKG9wdGlvbnMsIHVzZXIpID0+IHtcbiAgaWYgKG9wdGlvbnMucHJvZmlsZSlcbiAgICB1c2VyLnByb2ZpbGUgPSBvcHRpb25zLnByb2ZpbGU7XG4gIHJldHVybiB1c2VyO1xufTtcblxuLy8gVmFsaWRhdGUgbmV3IHVzZXIncyBlbWFpbCBvciBHb29nbGUvRmFjZWJvb2svR2l0SHViIGFjY291bnQncyBlbWFpbFxuZnVuY3Rpb24gZGVmYXVsdFZhbGlkYXRlTmV3VXNlckhvb2sodXNlcikge1xuICBjb25zdCBkb21haW4gPSB0aGlzLl9vcHRpb25zLnJlc3RyaWN0Q3JlYXRpb25CeUVtYWlsRG9tYWluO1xuICBpZiAoIWRvbWFpbikge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgbGV0IGVtYWlsSXNHb29kID0gZmFsc2U7XG4gIGlmICh1c2VyLmVtYWlscyAmJiB1c2VyLmVtYWlscy5sZW5ndGggPiAwKSB7XG4gICAgZW1haWxJc0dvb2QgPSB1c2VyLmVtYWlscy5yZWR1Y2UoXG4gICAgICAocHJldiwgZW1haWwpID0+IHByZXYgfHwgdGhpcy5fdGVzdEVtYWlsRG9tYWluKGVtYWlsLmFkZHJlc3MpLCBmYWxzZVxuICAgICk7XG4gIH0gZWxzZSBpZiAodXNlci5zZXJ2aWNlcyAmJiBPYmplY3QudmFsdWVzKHVzZXIuc2VydmljZXMpLmxlbmd0aCA+IDApIHtcbiAgICAvLyBGaW5kIGFueSBlbWFpbCBvZiBhbnkgc2VydmljZSBhbmQgY2hlY2sgaXRcbiAgICBlbWFpbElzR29vZCA9IE9iamVjdC52YWx1ZXModXNlci5zZXJ2aWNlcykucmVkdWNlKFxuICAgICAgKHByZXYsIHNlcnZpY2UpID0+IHNlcnZpY2UuZW1haWwgJiYgdGhpcy5fdGVzdEVtYWlsRG9tYWluKHNlcnZpY2UuZW1haWwpLFxuICAgICAgZmFsc2UsXG4gICAgKTtcbiAgfVxuXG4gIGlmIChlbWFpbElzR29vZCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBkb21haW4gPT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcig0MDMsIGBAJHtkb21haW59IGVtYWlsIHJlcXVpcmVkYCk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiRW1haWwgZG9lc24ndCBtYXRjaCB0aGUgY3JpdGVyaWEuXCIpO1xuICB9XG59XG5cbmNvbnN0IHNldHVwVXNlcnNDb2xsZWN0aW9uID0gdXNlcnMgPT4ge1xuICAvLy9cbiAgLy8vIFJFU1RSSUNUSU5HIFdSSVRFUyBUTyBVU0VSIE9CSkVDVFNcbiAgLy8vXG4gIHVzZXJzLmFsbG93KHtcbiAgICAvLyBjbGllbnRzIGNhbiBtb2RpZnkgdGhlIHByb2ZpbGUgZmllbGQgb2YgdGhlaXIgb3duIGRvY3VtZW50LCBhbmRcbiAgICAvLyBub3RoaW5nIGVsc2UuXG4gICAgdXBkYXRlOiAodXNlcklkLCB1c2VyLCBmaWVsZHMsIG1vZGlmaWVyKSA9PiB7XG4gICAgICAvLyBtYWtlIHN1cmUgaXQgaXMgb3VyIHJlY29yZFxuICAgICAgaWYgKHVzZXIuX2lkICE9PSB1c2VySWQpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICAvLyB1c2VyIGNhbiBvbmx5IG1vZGlmeSB0aGUgJ3Byb2ZpbGUnIGZpZWxkLiBzZXRzIHRvIG11bHRpcGxlXG4gICAgICAvLyBzdWIta2V5cyAoZWcgcHJvZmlsZS5mb28gYW5kIHByb2ZpbGUuYmFyKSBhcmUgbWVyZ2VkIGludG8gZW50cnlcbiAgICAgIC8vIGluIHRoZSBmaWVsZHMgbGlzdC5cbiAgICAgIGlmIChmaWVsZHMubGVuZ3RoICE9PSAxIHx8IGZpZWxkc1swXSAhPT0gJ3Byb2ZpbGUnKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSxcbiAgICBmZXRjaDogWydfaWQnXSAvLyB3ZSBvbmx5IGxvb2sgYXQgX2lkLlxuICB9KTtcblxuICAvLy8gREVGQVVMVCBJTkRFWEVTIE9OIFVTRVJTXG4gIHVzZXJzLmNyZWF0ZUluZGV4KCd1c2VybmFtZScsIHsgdW5pcXVlOiB0cnVlLCBzcGFyc2U6IHRydWUgfSk7XG4gIHVzZXJzLmNyZWF0ZUluZGV4KCdlbWFpbHMuYWRkcmVzcycsIHsgdW5pcXVlOiB0cnVlLCBzcGFyc2U6IHRydWUgfSk7XG4gIHVzZXJzLmNyZWF0ZUluZGV4KCdzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnMuaGFzaGVkVG9rZW4nLFxuICAgIHsgdW5pcXVlOiB0cnVlLCBzcGFyc2U6IHRydWUgfSk7XG4gIHVzZXJzLmNyZWF0ZUluZGV4KCdzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnMudG9rZW4nLFxuICAgIHsgdW5pcXVlOiB0cnVlLCBzcGFyc2U6IHRydWUgfSk7XG4gIC8vIEZvciB0YWtpbmcgY2FyZSBvZiBsb2dvdXRPdGhlckNsaWVudHMgY2FsbHMgdGhhdCBjcmFzaGVkIGJlZm9yZSB0aGVcbiAgLy8gdG9rZW5zIHdlcmUgZGVsZXRlZC5cbiAgdXNlcnMuY3JlYXRlSW5kZXgoJ3NlcnZpY2VzLnJlc3VtZS5oYXZlTG9naW5Ub2tlbnNUb0RlbGV0ZScsXG4gICAgeyBzcGFyc2U6IHRydWUgfSk7XG4gIC8vIEZvciBleHBpcmluZyBsb2dpbiB0b2tlbnNcbiAgdXNlcnMuY3JlYXRlSW5kZXgoXCJzZXJ2aWNlcy5yZXN1bWUubG9naW5Ub2tlbnMud2hlblwiLCB7IHNwYXJzZTogdHJ1ZSB9KTtcbiAgLy8gRm9yIGV4cGlyaW5nIHBhc3N3b3JkIHRva2Vuc1xuICB1c2Vycy5jcmVhdGVJbmRleCgnc2VydmljZXMucGFzc3dvcmQucmVzZXQud2hlbicsIHsgc3BhcnNlOiB0cnVlIH0pO1xuICB1c2Vycy5jcmVhdGVJbmRleCgnc2VydmljZXMucGFzc3dvcmQuZW5yb2xsLndoZW4nLCB7IHNwYXJzZTogdHJ1ZSB9KTtcbn07XG5cblxuLy8gR2VuZXJhdGVzIHBlcm11dGF0aW9ucyBvZiBhbGwgY2FzZSB2YXJpYXRpb25zIG9mIGEgZ2l2ZW4gc3RyaW5nLlxuY29uc3QgZ2VuZXJhdGVDYXNlUGVybXV0YXRpb25zRm9yU3RyaW5nID0gc3RyaW5nID0+IHtcbiAgbGV0IHBlcm11dGF0aW9ucyA9IFsnJ107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgY2ggPSBzdHJpbmcuY2hhckF0KGkpO1xuICAgIHBlcm11dGF0aW9ucyA9IFtdLmNvbmNhdCguLi4ocGVybXV0YXRpb25zLm1hcChwcmVmaXggPT4ge1xuICAgICAgY29uc3QgbG93ZXJDYXNlQ2hhciA9IGNoLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCB1cHBlckNhc2VDaGFyID0gY2gudG9VcHBlckNhc2UoKTtcbiAgICAgIC8vIERvbid0IGFkZCB1bm5lY2Vzc2FyeSBwZXJtdXRhdGlvbnMgd2hlbiBjaCBpcyBub3QgYSBsZXR0ZXJcbiAgICAgIGlmIChsb3dlckNhc2VDaGFyID09PSB1cHBlckNhc2VDaGFyKSB7XG4gICAgICAgIHJldHVybiBbcHJlZml4ICsgY2hdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFtwcmVmaXggKyBsb3dlckNhc2VDaGFyLCBwcmVmaXggKyB1cHBlckNhc2VDaGFyXTtcbiAgICAgIH1cbiAgICB9KSkpO1xuICB9XG4gIHJldHVybiBwZXJtdXRhdGlvbnM7XG59XG5cbiJdfQ==
