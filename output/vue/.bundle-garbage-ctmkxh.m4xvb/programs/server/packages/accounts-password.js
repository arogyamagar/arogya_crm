(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var global = Package.meteor.global;
var meteorEnv = Package.meteor.meteorEnv;
var Accounts = Package['accounts-base'].Accounts;
var SHA256 = Package.sha.SHA256;
var EJSON = Package.ejson.EJSON;
var DDP = Package['ddp-client'].DDP;
var DDPServer = Package['ddp-server'].DDPServer;
var Email = Package.email.Email;
var EmailInternals = Package.email.EmailInternals;
var Random = Package.random.Random;
var check = Package.check.check;
var Match = Package.check.Match;
var ECMAScript = Package.ecmascript.ECMAScript;
var meteorInstall = Package.modules.meteorInstall;
var Promise = Package.promise.Promise;

var require = meteorInstall({"node_modules":{"meteor":{"accounts-password":{"email_templates.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                           //
// packages/accounts-password/email_templates.js                                                             //
//                                                                                                           //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                             //
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
const greet = welcomeMsg => (user, url) => {
  const greeting = user.profile && user.profile.name ? "Hello ".concat(user.profile.name, ",") : 'Hello,';
  return "".concat(greeting, "\n\n").concat(welcomeMsg, ", simply click the link below.\n\n").concat(url, "\n\nThank you.\n");
};

/**
 * @summary Options to customize emails sent from the Accounts system.
 * @locus Server
 * @importFromPackage accounts-base
 */
Accounts.emailTemplates = _objectSpread(_objectSpread({}, Accounts.emailTemplates || {}), {}, {
  from: 'Accounts Example <no-reply@example.com>',
  siteName: Meteor.absoluteUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''),
  resetPassword: {
    subject: () => "How to reset your password on ".concat(Accounts.emailTemplates.siteName),
    text: greet('To reset your password')
  },
  verifyEmail: {
    subject: () => "How to verify email address on ".concat(Accounts.emailTemplates.siteName),
    text: greet('To verify your account email')
  },
  enrollAccount: {
    subject: () => "An account has been created for you on ".concat(Accounts.emailTemplates.siteName),
    text: greet('To start using the service')
  }
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"password_server.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                           //
// packages/accounts-password/password_server.js                                                             //
//                                                                                                           //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                             //
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
let bcryptHash, bcryptCompare;
module.link("bcrypt", {
  hash(v) {
    bcryptHash = v;
  },
  compare(v) {
    bcryptCompare = v;
  }
}, 0);
let Accounts;
module.link("meteor/accounts-base", {
  Accounts(v) {
    Accounts = v;
  }
}, 1);
// Utility for grabbing user
const getUserById = (id, options) => Meteor.users.findOne(id, Accounts._addDefaultFieldSelector(options));

// User records have a 'services.password.bcrypt' field on them to hold
// their hashed passwords.
//
// When the client sends a password to the server, it can either be a
// string (the plaintext password) or an object with keys 'digest' and
// 'algorithm' (must be "sha-256" for now). The Meteor client always sends
// password objects { digest: *, algorithm: "sha-256" }, but DDP clients
// that don't have access to SHA can just send plaintext passwords as
// strings.
//
// When the server receives a plaintext password as a string, it always
// hashes it with SHA256 before passing it into bcrypt. When the server
// receives a password as an object, it asserts that the algorithm is
// "sha-256" and then passes the digest to bcrypt.

Accounts._bcryptRounds = () => Accounts._options.bcryptRounds || 10;

// Given a 'password' from the client, extract the string that we should
// bcrypt. 'password' can be one of:
//  - String (the plaintext password)
//  - Object with 'digest' and 'algorithm' keys. 'algorithm' must be "sha-256".
//
const getPasswordString = password => {
  if (typeof password === "string") {
    password = SHA256(password);
  } else {
    // 'password' is an object
    if (password.algorithm !== "sha-256") {
      throw new Error("Invalid password hash algorithm. " + "Only 'sha-256' is allowed.");
    }
    password = password.digest;
  }
  return password;
};

// Use bcrypt to hash the password for storage in the database.
// `password` can be a string (in which case it will be run through
// SHA256 before bcrypt) or an object with properties `digest` and
// `algorithm` (in which case we bcrypt `password.digest`).
//
const hashPassword = password => Promise.asyncApply(() => {
  password = getPasswordString(password);
  return Promise.await(bcryptHash(password, Accounts._bcryptRounds()));
});

// Extract the number of rounds used in the specified bcrypt hash.
const getRoundsFromBcryptHash = hash => {
  let rounds;
  if (hash) {
    const hashSegments = hash.split('$');
    if (hashSegments.length > 2) {
      rounds = parseInt(hashSegments[2], 10);
    }
  }
  return rounds;
};

// Check whether the provided password matches the bcrypt'ed password in
// the database user record. `password` can be a string (in which case
// it will be run through SHA256 before bcrypt) or an object with
// properties `digest` and `algorithm` (in which case we bcrypt
// `password.digest`).
//
// The user parameter needs at least user._id and user.services
Accounts._checkPasswordUserFields = {
  _id: 1,
  services: 1
};
//
const checkPasswordAsync = (user, password) => Promise.asyncApply(() => {
  const result = {
    userId: user._id
  };
  const formattedPassword = getPasswordString(password);
  const hash = user.services.password.bcrypt;
  const hashRounds = getRoundsFromBcryptHash(hash);
  if (!Promise.await(bcryptCompare(formattedPassword, hash))) {
    result.error = Accounts._handleError("Incorrect password", false);
  } else if (hash && Accounts._bcryptRounds() != hashRounds) {
    // The password checks out, but the user's bcrypt hash needs to be updated.

    Meteor.defer(() => Promise.asyncApply(() => {
      Meteor.users.update({
        _id: user._id
      }, {
        $set: {
          'services.password.bcrypt': Promise.await(bcryptHash(formattedPassword, Accounts._bcryptRounds()))
        }
      });
    }));
  }
  return result;
});
const checkPassword = (user, password) => {
  return Promise.await(checkPasswordAsync(user, password));
};
Accounts._checkPassword = checkPassword;
Accounts._checkPasswordAsync = checkPasswordAsync;

///
/// LOGIN
///

/**
 * @summary Finds the user with the specified username.
 * First tries to match username case sensitively; if that fails, it
 * tries case insensitively; but if more than one user matches the case
 * insensitive search, it returns null.
 * @locus Server
 * @param {String} username The username to look for
 * @param {Object} [options]
 * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
 * @returns {Object} A user if found, else null
 * @importFromPackage accounts-base
 */
Accounts.findUserByUsername = (username, options) => Accounts._findUserByQuery({
  username
}, options);

/**
 * @summary Finds the user with the specified email.
 * First tries to match email case sensitively; if that fails, it
 * tries case insensitively; but if more than one user matches the case
 * insensitive search, it returns null.
 * @locus Server
 * @param {String} email The email address to look for
 * @param {Object} [options]
 * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
 * @returns {Object} A user if found, else null
 * @importFromPackage accounts-base
 */
Accounts.findUserByEmail = (email, options) => Accounts._findUserByQuery({
  email
}, options);

// XXX maybe this belongs in the check package
const NonEmptyString = Match.Where(x => {
  check(x, String);
  return x.length > 0;
});
const passwordValidator = Match.OneOf(Match.Where(str => {
  var _Meteor$settings, _Meteor$settings$pack, _Meteor$settings$pack2;
  return Match.test(str, String) && str.length <= ((_Meteor$settings = Meteor.settings) === null || _Meteor$settings === void 0 ? void 0 : (_Meteor$settings$pack = _Meteor$settings.packages) === null || _Meteor$settings$pack === void 0 ? void 0 : (_Meteor$settings$pack2 = _Meteor$settings$pack.accounts) === null || _Meteor$settings$pack2 === void 0 ? void 0 : _Meteor$settings$pack2.passwordMaxLength) || 256;
}), {
  digest: Match.Where(str => Match.test(str, String) && str.length === 64),
  algorithm: Match.OneOf('sha-256')
});

// Handler to login with a password.
//
// The Meteor client sets options.password to an object with keys
// 'digest' (set to SHA256(password)) and 'algorithm' ("sha-256").
//
// For other DDP clients which don't have access to SHA, the handler
// also accepts the plaintext password in options.password as a string.
//
// (It might be nice if servers could turn the plaintext password
// option off. Or maybe it should be opt-in, not opt-out?
// Accounts.config option?)
//
// Note that neither password option is secure without SSL.
//
Accounts.registerLoginHandler("password", options => Promise.asyncApply(() => {
  var _Accounts$_check2faEn, _Accounts;
  if (!options.password) return undefined; // don't handle

  check(options, {
    user: Accounts._userQueryValidator,
    password: passwordValidator,
    code: Match.Optional(NonEmptyString)
  });
  const user = Accounts._findUserByQuery(options.user, {
    fields: _objectSpread({
      services: 1
    }, Accounts._checkPasswordUserFields)
  });
  if (!user) {
    Accounts._handleError("User not found");
  }
  if (!user.services || !user.services.password || !user.services.password.bcrypt) {
    Accounts._handleError("User has no password set");
  }
  const result = Promise.await(checkPasswordAsync(user, options.password));
  // This method is added by the package accounts-2fa
  // First the login is validated, then the code situation is checked
  if (!result.error && (_Accounts$_check2faEn = (_Accounts = Accounts)._check2faEnabled) !== null && _Accounts$_check2faEn !== void 0 && _Accounts$_check2faEn.call(_Accounts, user)) {
    if (!options.code) {
      Accounts._handleError('2FA code must be informed', true, 'no-2fa-code');
    }
    if (!Accounts._isTokenValid(user.services.twoFactorAuthentication.secret, options.code)) {
      Accounts._handleError('Invalid 2FA code', true, 'invalid-2fa-code');
    }
  }
  return result;
}));

///
/// CHANGING
///

/**
 * @summary Change a user's username. Use this instead of updating the
 * database directly. The operation will fail if there is an existing user
 * with a username only differing in case.
 * @locus Server
 * @param {String} userId The ID of the user to update.
 * @param {String} newUsername A new username for the user.
 * @importFromPackage accounts-base
 */
Accounts.setUsername = (userId, newUsername) => {
  check(userId, NonEmptyString);
  check(newUsername, NonEmptyString);
  const user = getUserById(userId, {
    fields: {
      username: 1
    }
  });
  if (!user) {
    Accounts._handleError("User not found");
  }
  const oldUsername = user.username;

  // Perform a case insensitive check for duplicates before update
  Accounts._checkForCaseInsensitiveDuplicates('username', 'Username', newUsername, user._id);
  Meteor.users.update({
    _id: user._id
  }, {
    $set: {
      username: newUsername
    }
  });

  // Perform another check after update, in case a matching user has been
  // inserted in the meantime
  try {
    Accounts._checkForCaseInsensitiveDuplicates('username', 'Username', newUsername, user._id);
  } catch (ex) {
    // Undo update if the check fails
    Meteor.users.update({
      _id: user._id
    }, {
      $set: {
        username: oldUsername
      }
    });
    throw ex;
  }
};

// Let the user change their own password if they know the old
// password. `oldPassword` and `newPassword` should be objects with keys
// `digest` and `algorithm` (representing the SHA256 of the password).
Meteor.methods({
  changePassword: function (oldPassword, newPassword) {
    return Promise.asyncApply(() => {
      check(oldPassword, passwordValidator);
      check(newPassword, passwordValidator);
      if (!this.userId) {
        throw new Meteor.Error(401, "Must be logged in");
      }
      const user = getUserById(this.userId, {
        fields: _objectSpread({
          services: 1
        }, Accounts._checkPasswordUserFields)
      });
      if (!user) {
        Accounts._handleError("User not found");
      }
      if (!user.services || !user.services.password || !user.services.password.bcrypt) {
        Accounts._handleError("User has no password set");
      }
      const result = Promise.await(checkPasswordAsync(user, oldPassword));
      if (result.error) {
        throw result.error;
      }
      const hashed = Promise.await(hashPassword(newPassword));

      // It would be better if this removed ALL existing tokens and replaced
      // the token for the current connection with a new one, but that would
      // be tricky, so we'll settle for just replacing all tokens other than
      // the one for the current connection.
      const currentToken = Accounts._getLoginToken(this.connection.id);
      Meteor.users.update({
        _id: this.userId
      }, {
        $set: {
          'services.password.bcrypt': hashed
        },
        $pull: {
          'services.resume.loginTokens': {
            hashedToken: {
              $ne: currentToken
            }
          }
        },
        $unset: {
          'services.password.reset': 1
        }
      });
      return {
        passwordChanged: true
      };
    });
  }
});

// Force change the users password.

/**
 * @summary Forcibly change the password for a user.
 * @locus Server
 * @param {String} userId The id of the user to update.
 * @param {String} newPassword A new password for the user.
 * @param {Object} [options]
 * @param {Object} options.logout Logout all current connections with this userId (default: true)
 * @importFromPackage accounts-base
 */
Accounts.setPasswordAsync = (userId, newPlaintextPassword, options) => Promise.asyncApply(() => {
  check(userId, String);
  check(newPlaintextPassword, Match.Where(str => {
    var _Meteor$settings2, _Meteor$settings2$pac, _Meteor$settings2$pac2;
    return Match.test(str, String) && str.length <= ((_Meteor$settings2 = Meteor.settings) === null || _Meteor$settings2 === void 0 ? void 0 : (_Meteor$settings2$pac = _Meteor$settings2.packages) === null || _Meteor$settings2$pac === void 0 ? void 0 : (_Meteor$settings2$pac2 = _Meteor$settings2$pac.accounts) === null || _Meteor$settings2$pac2 === void 0 ? void 0 : _Meteor$settings2$pac2.passwordMaxLength) || 256;
  }));
  check(options, Match.Maybe({
    logout: Boolean
  }));
  options = _objectSpread({
    logout: true
  }, options);
  const user = getUserById(userId, {
    fields: {
      _id: 1
    }
  });
  if (!user) {
    throw new Meteor.Error(403, "User not found");
  }
  const update = {
    $unset: {
      'services.password.reset': 1
    },
    $set: {
      'services.password.bcrypt': Promise.await(hashPassword(newPlaintextPassword))
    }
  };
  if (options.logout) {
    update.$unset['services.resume.loginTokens'] = 1;
  }
  Meteor.users.update({
    _id: user._id
  }, update);
});

/**
 * @summary Forcibly change the password for a user.
 * @locus Server
 * @param {String} userId The id of the user to update.
 * @param {String} newPassword A new password for the user.
 * @param {Object} [options]
 * @param {Object} options.logout Logout all current connections with this userId (default: true)
 * @importFromPackage accounts-base
 */
Accounts.setPassword = (userId, newPlaintextPassword, options) => {
  return Promise.await(Accounts.setPasswordAsync(userId, newPlaintextPassword, options));
};

///
/// RESETTING VIA EMAIL
///

// Utility for plucking addresses from emails
const pluckAddresses = function () {
  let emails = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
  return emails.map(email => email.address);
};

// Method called by a user to request a password reset email. This is
// the start of the reset process.
Meteor.methods({
  forgotPassword: options => {
    check(options, {
      email: String
    });
    const user = Accounts.findUserByEmail(options.email, {
      fields: {
        emails: 1
      }
    });
    if (!user) {
      Accounts._handleError("User not found");
    }
    const emails = pluckAddresses(user.emails);
    const caseSensitiveEmail = emails.find(email => email.toLowerCase() === options.email.toLowerCase());
    Accounts.sendResetPasswordEmail(user._id, caseSensitiveEmail);
  }
});

/**
 * @summary Generates a reset token and saves it into the database.
 * @locus Server
 * @param {String} userId The id of the user to generate the reset token for.
 * @param {String} email Which address of the user to generate the reset token for. This address must be in the user's `emails` list. If `null`, defaults to the first email in the list.
 * @param {String} reason `resetPassword` or `enrollAccount`.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @returns {Object} Object with {email, user, token} values.
 * @importFromPackage accounts-base
 */
Accounts.generateResetToken = (userId, email, reason, extraTokenData) => {
  // Make sure the user exists, and email is one of their addresses.
  // Don't limit the fields in the user object since the user is returned
  // by the function and some other fields might be used elsewhere.
  const user = getUserById(userId);
  if (!user) {
    Accounts._handleError("Can't find user");
  }

  // pick the first email if we weren't passed an email.
  if (!email && user.emails && user.emails[0]) {
    email = user.emails[0].address;
  }

  // make sure we have a valid email
  if (!email || !pluckAddresses(user.emails).includes(email)) {
    Accounts._handleError("No such email for user.");
  }
  const token = Random.secret();
  const tokenRecord = {
    token,
    email,
    when: new Date()
  };
  if (reason === 'resetPassword') {
    tokenRecord.reason = 'reset';
  } else if (reason === 'enrollAccount') {
    tokenRecord.reason = 'enroll';
  } else if (reason) {
    // fallback so that this function can be used for unknown reasons as well
    tokenRecord.reason = reason;
  }
  if (extraTokenData) {
    Object.assign(tokenRecord, extraTokenData);
  }
  // if this method is called from the enroll account work-flow then
  // store the token record in 'services.password.enroll' db field
  // else store the token record in in 'services.password.reset' db field
  if (reason === 'enrollAccount') {
    Meteor.users.update({
      _id: user._id
    }, {
      $set: {
        'services.password.enroll': tokenRecord
      }
    });
    // before passing to template, update user object with new token
    Meteor._ensure(user, 'services', 'password').enroll = tokenRecord;
  } else {
    Meteor.users.update({
      _id: user._id
    }, {
      $set: {
        'services.password.reset': tokenRecord
      }
    });
    // before passing to template, update user object with new token
    Meteor._ensure(user, 'services', 'password').reset = tokenRecord;
  }
  return {
    email,
    user,
    token
  };
};

/**
 * @summary Generates an e-mail verification token and saves it into the database.
 * @locus Server
 * @param {String} userId The id of the user to generate the  e-mail verification token for.
 * @param {String} email Which address of the user to generate the e-mail verification token for. This address must be in the user's `emails` list. If `null`, defaults to the first unverified email in the list.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @returns {Object} Object with {email, user, token} values.
 * @importFromPackage accounts-base
 */
Accounts.generateVerificationToken = (userId, email, extraTokenData) => {
  // Make sure the user exists, and email is one of their addresses.
  // Don't limit the fields in the user object since the user is returned
  // by the function and some other fields might be used elsewhere.
  const user = getUserById(userId);
  if (!user) {
    Accounts._handleError("Can't find user");
  }

  // pick the first unverified email if we weren't passed an email.
  if (!email) {
    const emailRecord = (user.emails || []).find(e => !e.verified);
    email = (emailRecord || {}).address;
    if (!email) {
      Accounts._handleError("That user has no unverified email addresses.");
    }
  }

  // make sure we have a valid email
  if (!email || !pluckAddresses(user.emails).includes(email)) {
    Accounts._handleError("No such email for user.");
  }
  const token = Random.secret();
  const tokenRecord = {
    token,
    // TODO: This should probably be renamed to "email" to match reset token record.
    address: email,
    when: new Date()
  };
  if (extraTokenData) {
    Object.assign(tokenRecord, extraTokenData);
  }
  Meteor.users.update({
    _id: user._id
  }, {
    $push: {
      'services.email.verificationTokens': tokenRecord
    }
  });

  // before passing to template, update user object with new token
  Meteor._ensure(user, 'services', 'email');
  if (!user.services.email.verificationTokens) {
    user.services.email.verificationTokens = [];
  }
  user.services.email.verificationTokens.push(tokenRecord);
  return {
    email,
    user,
    token
  };
};

// send the user an email with a link that when opened allows the user
// to set a new password, without the old password.

/**
 * @summary Send an email with a link the user can use to reset their password.
 * @locus Server
 * @param {String} userId The id of the user to send email to.
 * @param {String} [email] Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first email in the list.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @param {Object} [extraParams] Optional additional params to be added to the reset url.
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendResetPasswordEmail = (userId, email, extraTokenData, extraParams) => {
  const {
    email: realEmail,
    user,
    token
  } = Accounts.generateResetToken(userId, email, 'resetPassword', extraTokenData);
  const url = Accounts.urls.resetPassword(token, extraParams);
  const options = Accounts.generateOptionsForEmail(realEmail, user, url, 'resetPassword');
  Email.send(options);
  if (Meteor.isDevelopment) {
    console.log("\nReset password URL: ".concat(url));
  }
  return {
    email: realEmail,
    user,
    token,
    url,
    options
  };
};

// send the user an email informing them that their account was created, with
// a link that when opened both marks their email as verified and forces them
// to choose their password. The email must be one of the addresses in the
// user's emails field, or undefined to pick the first email automatically.
//
// This is not called automatically. It must be called manually if you
// want to use enrollment emails.

/**
 * @summary Send an email with a link the user can use to set their initial password.
 * @locus Server
 * @param {String} userId The id of the user to send email to.
 * @param {String} [email] Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first email in the list.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @param {Object} [extraParams] Optional additional params to be added to the enrollment url.
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendEnrollmentEmail = (userId, email, extraTokenData, extraParams) => {
  const {
    email: realEmail,
    user,
    token
  } = Accounts.generateResetToken(userId, email, 'enrollAccount', extraTokenData);
  const url = Accounts.urls.enrollAccount(token, extraParams);
  const options = Accounts.generateOptionsForEmail(realEmail, user, url, 'enrollAccount');
  Email.send(options);
  if (Meteor.isDevelopment) {
    console.log("\nEnrollment email URL: ".concat(url));
  }
  return {
    email: realEmail,
    user,
    token,
    url,
    options
  };
};

// Take token from sendResetPasswordEmail or sendEnrollmentEmail, change
// the users password, and log them in.
Meteor.methods({
  resetPassword: function () {
    return Promise.asyncApply(() => {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      const token = args[0];
      const newPassword = args[1];
      return Promise.await(Accounts._loginMethod(this, "resetPassword", args, "password", () => Promise.asyncApply(() => {
        var _Accounts$_check2faEn2, _Accounts2;
        check(token, String);
        check(newPassword, passwordValidator);
        let user = Meteor.users.findOne({
          "services.password.reset.token": token
        }, {
          fields: {
            services: 1,
            emails: 1
          }
        });
        let isEnroll = false;
        // if token is in services.password.reset db field implies
        // this method is was not called from enroll account workflow
        // else this method is called from enroll account workflow
        if (!user) {
          user = Meteor.users.findOne({
            "services.password.enroll.token": token
          }, {
            fields: {
              services: 1,
              emails: 1
            }
          });
          isEnroll = true;
        }
        if (!user) {
          throw new Meteor.Error(403, "Token expired");
        }
        let tokenRecord = {};
        if (isEnroll) {
          tokenRecord = user.services.password.enroll;
        } else {
          tokenRecord = user.services.password.reset;
        }
        const {
          when,
          email
        } = tokenRecord;
        let tokenLifetimeMs = Accounts._getPasswordResetTokenLifetimeMs();
        if (isEnroll) {
          tokenLifetimeMs = Accounts._getPasswordEnrollTokenLifetimeMs();
        }
        const currentTimeMs = Date.now();
        if (currentTimeMs - when > tokenLifetimeMs) throw new Meteor.Error(403, "Token expired");
        if (!pluckAddresses(user.emails).includes(email)) return {
          userId: user._id,
          error: new Meteor.Error(403, "Token has invalid email address")
        };
        const hashed = Promise.await(hashPassword(newPassword));

        // NOTE: We're about to invalidate tokens on the user, who we might be
        // logged in as. Make sure to avoid logging ourselves out if this
        // happens. But also make sure not to leave the connection in a state
        // of having a bad token set if things fail.
        const oldToken = Accounts._getLoginToken(this.connection.id);
        Accounts._setLoginToken(user._id, this.connection, null);
        const resetToOldToken = () => Accounts._setLoginToken(user._id, this.connection, oldToken);
        try {
          // Update the user record by:
          // - Changing the password to the new one
          // - Forgetting about the reset token or enroll token that was just used
          // - Verifying their email, since they got the password reset via email.
          let affectedRecords = {};
          // if reason is enroll then check services.password.enroll.token field for affected records
          if (isEnroll) {
            affectedRecords = Meteor.users.update({
              _id: user._id,
              'emails.address': email,
              'services.password.enroll.token': token
            }, {
              $set: {
                'services.password.bcrypt': hashed,
                'emails.$.verified': true
              },
              $unset: {
                'services.password.enroll': 1
              }
            });
          } else {
            affectedRecords = Meteor.users.update({
              _id: user._id,
              'emails.address': email,
              'services.password.reset.token': token
            }, {
              $set: {
                'services.password.bcrypt': hashed,
                'emails.$.verified': true
              },
              $unset: {
                'services.password.reset': 1
              }
            });
          }
          if (affectedRecords !== 1) return {
            userId: user._id,
            error: new Meteor.Error(403, "Invalid email")
          };
        } catch (err) {
          resetToOldToken();
          throw err;
        }

        // Replace all valid login tokens with new ones (changing
        // password should invalidate existing sessions).
        Accounts._clearAllLoginTokens(user._id);
        if ((_Accounts$_check2faEn2 = (_Accounts2 = Accounts)._check2faEnabled) !== null && _Accounts$_check2faEn2 !== void 0 && _Accounts$_check2faEn2.call(_Accounts2, user)) {
          return {
            userId: user._id,
            error: Accounts._handleError('Changed password, but user not logged in because 2FA is enabled', false, '2fa-enabled')
          };
        }
        return {
          userId: user._id
        };
      })));
    });
  }
});

///
/// EMAIL VERIFICATION
///

// send the user an email with a link that when opened marks that
// address as verified

/**
 * @summary Send an email with a link the user can use verify their email address.
 * @locus Server
 * @param {String} userId The id of the user to send email to.
 * @param {String} [email] Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first unverified email in the list.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @param {Object} [extraParams] Optional additional params to be added to the verification url.
 *
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendVerificationEmail = (userId, email, extraTokenData, extraParams) => {
  // XXX Also generate a link using which someone can delete this
  // account if they own said address but weren't those who created
  // this account.

  const {
    email: realEmail,
    user,
    token
  } = Accounts.generateVerificationToken(userId, email, extraTokenData);
  const url = Accounts.urls.verifyEmail(token, extraParams);
  const options = Accounts.generateOptionsForEmail(realEmail, user, url, 'verifyEmail');
  Email.send(options);
  if (Meteor.isDevelopment) {
    console.log("\nVerification email URL: ".concat(url));
  }
  return {
    email: realEmail,
    user,
    token,
    url,
    options
  };
};

// Take token from sendVerificationEmail, mark the email as verified,
// and log them in.
Meteor.methods({
  verifyEmail: function () {
    return Promise.asyncApply(() => {
      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }
      const token = args[0];
      return Promise.await(Accounts._loginMethod(this, "verifyEmail", args, "password", () => {
        var _Accounts$_check2faEn3, _Accounts3;
        check(token, String);
        const user = Meteor.users.findOne({
          'services.email.verificationTokens.token': token
        }, {
          fields: {
            services: 1,
            emails: 1
          }
        });
        if (!user) throw new Meteor.Error(403, "Verify email link expired");
        const tokenRecord = user.services.email.verificationTokens.find(t => t.token == token);
        if (!tokenRecord) return {
          userId: user._id,
          error: new Meteor.Error(403, "Verify email link expired")
        };
        const emailsRecord = user.emails.find(e => e.address == tokenRecord.address);
        if (!emailsRecord) return {
          userId: user._id,
          error: new Meteor.Error(403, "Verify email link is for unknown address")
        };

        // By including the address in the query, we can use 'emails.$' in the
        // modifier to get a reference to the specific object in the emails
        // array. See
        // http://www.mongodb.org/display/DOCS/Updating/#Updating-The%24positionaloperator)
        // http://www.mongodb.org/display/DOCS/Updating#Updating-%24pull
        Meteor.users.update({
          _id: user._id,
          'emails.address': tokenRecord.address
        }, {
          $set: {
            'emails.$.verified': true
          },
          $pull: {
            'services.email.verificationTokens': {
              address: tokenRecord.address
            }
          }
        });
        if ((_Accounts$_check2faEn3 = (_Accounts3 = Accounts)._check2faEnabled) !== null && _Accounts$_check2faEn3 !== void 0 && _Accounts$_check2faEn3.call(_Accounts3, user)) {
          return {
            userId: user._id,
            error: Accounts._handleError('Email verified, but user not logged in because 2FA is enabled', false, '2fa-enabled')
          };
        }
        return {
          userId: user._id
        };
      }));
    });
  }
});

/**
 * @summary Add an email address for a user. Use this instead of directly
 * updating the database. The operation will fail if there is a different user
 * with an email only differing in case. If the specified user has an existing
 * email only differing in case however, we replace it.
 * @locus Server
 * @param {String} userId The ID of the user to update.
 * @param {String} newEmail A new email address for the user.
 * @param {Boolean} [verified] Optional - whether the new email address should
 * be marked as verified. Defaults to false.
 * @importFromPackage accounts-base
 */
Accounts.addEmail = (userId, newEmail, verified) => {
  check(userId, NonEmptyString);
  check(newEmail, NonEmptyString);
  check(verified, Match.Optional(Boolean));
  if (verified === void 0) {
    verified = false;
  }
  const user = getUserById(userId, {
    fields: {
      emails: 1
    }
  });
  if (!user) throw new Meteor.Error(403, "User not found");

  // Allow users to change their own email to a version with a different case

  // We don't have to call checkForCaseInsensitiveDuplicates to do a case
  // insensitive check across all emails in the database here because: (1) if
  // there is no case-insensitive duplicate between this user and other users,
  // then we are OK and (2) if this would create a conflict with other users
  // then there would already be a case-insensitive duplicate and we can't fix
  // that in this code anyway.
  const caseInsensitiveRegExp = new RegExp("^".concat(Meteor._escapeRegExp(newEmail), "$"), 'i');
  const didUpdateOwnEmail = (user.emails || []).reduce((prev, email) => {
    if (caseInsensitiveRegExp.test(email.address)) {
      Meteor.users.update({
        _id: user._id,
        'emails.address': email.address
      }, {
        $set: {
          'emails.$.address': newEmail,
          'emails.$.verified': verified
        }
      });
      return true;
    } else {
      return prev;
    }
  }, false);

  // In the other updates below, we have to do another call to
  // checkForCaseInsensitiveDuplicates to make sure that no conflicting values
  // were added to the database in the meantime. We don't have to do this for
  // the case where the user is updating their email address to one that is the
  // same as before, but only different because of capitalization. Read the
  // big comment above to understand why.

  if (didUpdateOwnEmail) {
    return;
  }

  // Perform a case insensitive check for duplicates before update
  Accounts._checkForCaseInsensitiveDuplicates('emails.address', 'Email', newEmail, user._id);
  Meteor.users.update({
    _id: user._id
  }, {
    $addToSet: {
      emails: {
        address: newEmail,
        verified: verified
      }
    }
  });

  // Perform another check after update, in case a matching user has been
  // inserted in the meantime
  try {
    Accounts._checkForCaseInsensitiveDuplicates('emails.address', 'Email', newEmail, user._id);
  } catch (ex) {
    // Undo update if the check fails
    Meteor.users.update({
      _id: user._id
    }, {
      $pull: {
        emails: {
          address: newEmail
        }
      }
    });
    throw ex;
  }
};

/**
 * @summary Remove an email address for a user. Use this instead of updating
 * the database directly.
 * @locus Server
 * @param {String} userId The ID of the user to update.
 * @param {String} email The email address to remove.
 * @importFromPackage accounts-base
 */
Accounts.removeEmail = (userId, email) => {
  check(userId, NonEmptyString);
  check(email, NonEmptyString);
  const user = getUserById(userId, {
    fields: {
      _id: 1
    }
  });
  if (!user) throw new Meteor.Error(403, "User not found");
  Meteor.users.update({
    _id: user._id
  }, {
    $pull: {
      emails: {
        address: email
      }
    }
  });
};

///
/// CREATING USERS
///

// Shared createUser function called from the createUser method, both
// if originates in client or server code. Calls user provided hooks,
// does the actual user insertion.
//
// returns the user id
const createUser = options => Promise.asyncApply(() => {
  // Unknown keys allowed, because a onCreateUserHook can take arbitrary
  // options.
  check(options, Match.ObjectIncluding({
    username: Match.Optional(String),
    email: Match.Optional(String),
    password: Match.Optional(passwordValidator)
  }));
  const {
    username,
    email,
    password
  } = options;
  if (!username && !email) throw new Meteor.Error(400, "Need to set a username or email");
  const user = {
    services: {}
  };
  if (password) {
    const hashed = Promise.await(hashPassword(password));
    user.services.password = {
      bcrypt: hashed
    };
  }
  return Accounts._createUserCheckingDuplicates({
    user,
    email,
    username,
    options
  });
});

// method for create user. Requests come from the client.
Meteor.methods({
  createUser: function () {
    return Promise.asyncApply(() => {
      for (var _len3 = arguments.length, args = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
        args[_key3] = arguments[_key3];
      }
      const options = args[0];
      return Promise.await(Accounts._loginMethod(this, "createUser", args, "password", () => Promise.asyncApply(() => {
        // createUser() above does more checking.
        check(options, Object);
        if (Accounts._options.forbidClientAccountCreation) return {
          error: new Meteor.Error(403, "Signups forbidden")
        };
        const userId = Promise.await(Accounts.createUserVerifyingEmail(options));

        // client gets logged in as the new user afterwards.
        return {
          userId: userId
        };
      })));
    });
  }
});

/**
 * @summary Creates an user and sends an email if `options.email` is informed.
 * Then if the `sendVerificationEmail` option from the `Accounts` package is
 * enabled, you'll send a verification email if `options.password` is informed,
 * otherwise you'll send an enrollment email.
 * @locus Server
 * @param {Object} options The options object to be passed down when creating
 * the user
 * @param {String} options.username A unique name for this user.
 * @param {String} options.email The user's email address.
 * @param {String} options.password The user's password. This is __not__ sent in plain text over the wire.
 * @param {Object} options.profile The user's profile, typically including the `name` field.
 * @importFromPackage accounts-base
 * */
Accounts.createUserVerifyingEmail = options => Promise.asyncApply(() => {
  options = _objectSpread({}, options);
  // Create user. result contains id and token.
  const userId = Promise.await(createUser(options));
  // safety belt. createUser is supposed to throw on error. send 500 error
  // instead of sending a verification email with empty userid.
  if (!userId) throw new Error("createUser failed to insert new user");

  // If `Accounts._options.sendVerificationEmail` is set, register
  // a token to verify the user's primary email, and send it to
  // that address.
  if (options.email && Accounts._options.sendVerificationEmail) {
    if (options.password) {
      Accounts.sendVerificationEmail(userId, options.email);
    } else {
      Accounts.sendEnrollmentEmail(userId, options.email);
    }
  }
  return userId;
});

// Create user directly on the server.
//
// Unlike the client version, this does not log you in as this user
// after creation.
//
// returns Promise<userId> or throws an error if it can't create
//
// XXX add another argument ("server options") that gets sent to onCreateUser,
// which is always empty when called from the createUser method? eg, "admin:
// true", which we want to prevent the client from setting, but which a custom
// method calling Accounts.createUser could set?
//

Accounts.createUserAsync = (options, callback) => Promise.asyncApply(() => {
  options = _objectSpread({}, options);

  // XXX allow an optional callback?
  if (callback) {
    throw new Error("Accounts.createUser with callback not supported on the server yet.");
  }
  return createUser(options);
});

// Create user directly on the server.
//
// Unlike the client version, this does not log you in as this user
// after creation.
//
// returns userId or throws an error if it can't create
//
// XXX add another argument ("server options") that gets sent to onCreateUser,
// which is always empty when called from the createUser method? eg, "admin:
// true", which we want to prevent the client from setting, but which a custom
// method calling Accounts.createUser could set?
//

Accounts.createUser = (options, callback) => {
  return Promise.await(Accounts.createUserAsync(options, callback));
};

///
/// PASSWORD-SPECIFIC INDEXES ON USERS
///
Meteor.users.createIndex('services.email.verificationTokens.token', {
  unique: true,
  sparse: true
});
Meteor.users.createIndex('services.password.reset.token', {
  unique: true,
  sparse: true
});
Meteor.users.createIndex('services.password.enroll.token', {
  unique: true,
  sparse: true
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"node_modules":{"bcrypt":{"package.json":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                           //
// node_modules/meteor/accounts-password/node_modules/bcrypt/package.json                                    //
//                                                                                                           //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                             //
module.exports = {
  "name": "bcrypt",
  "version": "5.0.1",
  "main": "./bcrypt"
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"bcrypt.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                           //
// node_modules/meteor/accounts-password/node_modules/bcrypt/bcrypt.js                                       //
//                                                                                                           //
///////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                             //
module.useNode();
///////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}}}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

require("/node_modules/meteor/accounts-password/email_templates.js");
require("/node_modules/meteor/accounts-password/password_server.js");

/* Exports */
Package._define("accounts-password");

})();

//# sourceURL=meteor://💻app/packages/accounts-password.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvcGFja2FnZXMvYWNjb3VudHMtcGFzc3dvcmQvZW1haWxfdGVtcGxhdGVzLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9wYWNrYWdlcy9hY2NvdW50cy1wYXNzd29yZC9wYXNzd29yZF9zZXJ2ZXIuanMiXSwibmFtZXMiOlsiX29iamVjdFNwcmVhZCIsIm1vZHVsZSIsImxpbmsiLCJkZWZhdWx0IiwidiIsImdyZWV0Iiwid2VsY29tZU1zZyIsInVzZXIiLCJ1cmwiLCJncmVldGluZyIsInByb2ZpbGUiLCJuYW1lIiwiQWNjb3VudHMiLCJlbWFpbFRlbXBsYXRlcyIsImZyb20iLCJzaXRlTmFtZSIsIk1ldGVvciIsImFic29sdXRlVXJsIiwicmVwbGFjZSIsInJlc2V0UGFzc3dvcmQiLCJzdWJqZWN0IiwidGV4dCIsInZlcmlmeUVtYWlsIiwiZW5yb2xsQWNjb3VudCIsImJjcnlwdEhhc2giLCJiY3J5cHRDb21wYXJlIiwiaGFzaCIsImNvbXBhcmUiLCJnZXRVc2VyQnlJZCIsImlkIiwib3B0aW9ucyIsInVzZXJzIiwiZmluZE9uZSIsIl9hZGREZWZhdWx0RmllbGRTZWxlY3RvciIsIl9iY3J5cHRSb3VuZHMiLCJfb3B0aW9ucyIsImJjcnlwdFJvdW5kcyIsImdldFBhc3N3b3JkU3RyaW5nIiwicGFzc3dvcmQiLCJTSEEyNTYiLCJhbGdvcml0aG0iLCJFcnJvciIsImRpZ2VzdCIsImhhc2hQYXNzd29yZCIsImdldFJvdW5kc0Zyb21CY3J5cHRIYXNoIiwicm91bmRzIiwiaGFzaFNlZ21lbnRzIiwic3BsaXQiLCJsZW5ndGgiLCJwYXJzZUludCIsIl9jaGVja1Bhc3N3b3JkVXNlckZpZWxkcyIsIl9pZCIsInNlcnZpY2VzIiwiY2hlY2tQYXNzd29yZEFzeW5jIiwicmVzdWx0IiwidXNlcklkIiwiZm9ybWF0dGVkUGFzc3dvcmQiLCJiY3J5cHQiLCJoYXNoUm91bmRzIiwiZXJyb3IiLCJfaGFuZGxlRXJyb3IiLCJkZWZlciIsInVwZGF0ZSIsIiRzZXQiLCJjaGVja1Bhc3N3b3JkIiwiUHJvbWlzZSIsImF3YWl0IiwiX2NoZWNrUGFzc3dvcmQiLCJfY2hlY2tQYXNzd29yZEFzeW5jIiwiZmluZFVzZXJCeVVzZXJuYW1lIiwidXNlcm5hbWUiLCJfZmluZFVzZXJCeVF1ZXJ5IiwiZmluZFVzZXJCeUVtYWlsIiwiZW1haWwiLCJOb25FbXB0eVN0cmluZyIsIk1hdGNoIiwiV2hlcmUiLCJ4IiwiY2hlY2siLCJTdHJpbmciLCJwYXNzd29yZFZhbGlkYXRvciIsIk9uZU9mIiwic3RyIiwidGVzdCIsInNldHRpbmdzIiwicGFja2FnZXMiLCJhY2NvdW50cyIsInBhc3N3b3JkTWF4TGVuZ3RoIiwicmVnaXN0ZXJMb2dpbkhhbmRsZXIiLCJ1bmRlZmluZWQiLCJfdXNlclF1ZXJ5VmFsaWRhdG9yIiwiY29kZSIsIk9wdGlvbmFsIiwiZmllbGRzIiwiX2NoZWNrMmZhRW5hYmxlZCIsIl9pc1Rva2VuVmFsaWQiLCJ0d29GYWN0b3JBdXRoZW50aWNhdGlvbiIsInNlY3JldCIsInNldFVzZXJuYW1lIiwibmV3VXNlcm5hbWUiLCJvbGRVc2VybmFtZSIsIl9jaGVja0ZvckNhc2VJbnNlbnNpdGl2ZUR1cGxpY2F0ZXMiLCJleCIsIm1ldGhvZHMiLCJjaGFuZ2VQYXNzd29yZCIsIm9sZFBhc3N3b3JkIiwibmV3UGFzc3dvcmQiLCJoYXNoZWQiLCJjdXJyZW50VG9rZW4iLCJfZ2V0TG9naW5Ub2tlbiIsImNvbm5lY3Rpb24iLCIkcHVsbCIsImhhc2hlZFRva2VuIiwiJG5lIiwiJHVuc2V0IiwicGFzc3dvcmRDaGFuZ2VkIiwic2V0UGFzc3dvcmRBc3luYyIsIm5ld1BsYWludGV4dFBhc3N3b3JkIiwiTWF5YmUiLCJsb2dvdXQiLCJCb29sZWFuIiwic2V0UGFzc3dvcmQiLCJwbHVja0FkZHJlc3NlcyIsImVtYWlscyIsIm1hcCIsImFkZHJlc3MiLCJmb3Jnb3RQYXNzd29yZCIsImNhc2VTZW5zaXRpdmVFbWFpbCIsImZpbmQiLCJ0b0xvd2VyQ2FzZSIsInNlbmRSZXNldFBhc3N3b3JkRW1haWwiLCJnZW5lcmF0ZVJlc2V0VG9rZW4iLCJyZWFzb24iLCJleHRyYVRva2VuRGF0YSIsImluY2x1ZGVzIiwidG9rZW4iLCJSYW5kb20iLCJ0b2tlblJlY29yZCIsIndoZW4iLCJEYXRlIiwiT2JqZWN0IiwiYXNzaWduIiwiX2Vuc3VyZSIsImVucm9sbCIsInJlc2V0IiwiZ2VuZXJhdGVWZXJpZmljYXRpb25Ub2tlbiIsImVtYWlsUmVjb3JkIiwiZSIsInZlcmlmaWVkIiwiJHB1c2giLCJ2ZXJpZmljYXRpb25Ub2tlbnMiLCJwdXNoIiwiZXh0cmFQYXJhbXMiLCJyZWFsRW1haWwiLCJ1cmxzIiwiZ2VuZXJhdGVPcHRpb25zRm9yRW1haWwiLCJFbWFpbCIsInNlbmQiLCJpc0RldmVsb3BtZW50IiwiY29uc29sZSIsImxvZyIsInNlbmRFbnJvbGxtZW50RW1haWwiLCJhcmdzIiwiX2xvZ2luTWV0aG9kIiwiaXNFbnJvbGwiLCJ0b2tlbkxpZmV0aW1lTXMiLCJfZ2V0UGFzc3dvcmRSZXNldFRva2VuTGlmZXRpbWVNcyIsIl9nZXRQYXNzd29yZEVucm9sbFRva2VuTGlmZXRpbWVNcyIsImN1cnJlbnRUaW1lTXMiLCJub3ciLCJvbGRUb2tlbiIsIl9zZXRMb2dpblRva2VuIiwicmVzZXRUb09sZFRva2VuIiwiYWZmZWN0ZWRSZWNvcmRzIiwiZXJyIiwiX2NsZWFyQWxsTG9naW5Ub2tlbnMiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJ0IiwiZW1haWxzUmVjb3JkIiwiYWRkRW1haWwiLCJuZXdFbWFpbCIsImNhc2VJbnNlbnNpdGl2ZVJlZ0V4cCIsIlJlZ0V4cCIsIl9lc2NhcGVSZWdFeHAiLCJkaWRVcGRhdGVPd25FbWFpbCIsInJlZHVjZSIsInByZXYiLCIkYWRkVG9TZXQiLCJyZW1vdmVFbWFpbCIsImNyZWF0ZVVzZXIiLCJPYmplY3RJbmNsdWRpbmciLCJfY3JlYXRlVXNlckNoZWNraW5nRHVwbGljYXRlcyIsImZvcmJpZENsaWVudEFjY291bnRDcmVhdGlvbiIsImNyZWF0ZVVzZXJWZXJpZnlpbmdFbWFpbCIsImNyZWF0ZVVzZXJBc3luYyIsImNhbGxiYWNrIiwiY3JlYXRlSW5kZXgiLCJ1bmlxdWUiLCJzcGFyc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFJQSxhQUFhO0FBQUNDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLHNDQUFzQyxFQUFDO0VBQUNDLE9BQU8sQ0FBQ0MsQ0FBQyxFQUFDO0lBQUNKLGFBQWEsR0FBQ0ksQ0FBQztFQUFBO0FBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztBQUFyRyxNQUFNQyxLQUFLLEdBQUdDLFVBQVUsSUFBSSxDQUFDQyxJQUFJLEVBQUVDLEdBQUcsS0FBSztFQUN6QyxNQUFNQyxRQUFRLEdBQ1pGLElBQUksQ0FBQ0csT0FBTyxJQUFJSCxJQUFJLENBQUNHLE9BQU8sQ0FBQ0MsSUFBSSxtQkFDcEJKLElBQUksQ0FBQ0csT0FBTyxDQUFDQyxJQUFJLFNBQzFCLFFBQVE7RUFDZCxpQkFBVUYsUUFBUSxpQkFFbEJILFVBQVUsK0NBRVZFLEdBQUc7QUFJTCxDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQUksUUFBUSxDQUFDQyxjQUFjLG1DQUNqQkQsUUFBUSxDQUFDQyxjQUFjLElBQUksQ0FBQyxDQUFDO0VBQ2pDQyxJQUFJLEVBQUUseUNBQXlDO0VBQy9DQyxRQUFRLEVBQUVDLE1BQU0sQ0FBQ0MsV0FBVyxFQUFFLENBQzNCQyxPQUFPLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUMzQkEsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUM7RUFFckJDLGFBQWEsRUFBRTtJQUNiQyxPQUFPLEVBQUUsOENBQzBCUixRQUFRLENBQUNDLGNBQWMsQ0FBQ0UsUUFBUSxDQUFFO0lBQ3JFTSxJQUFJLEVBQUVoQixLQUFLLENBQUMsd0JBQXdCO0VBQ3RDLENBQUM7RUFDRGlCLFdBQVcsRUFBRTtJQUNYRixPQUFPLEVBQUUsK0NBQzJCUixRQUFRLENBQUNDLGNBQWMsQ0FBQ0UsUUFBUSxD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QUFBSyxDQUFDLENBQUM7QUFDekR0TCxNQUFNLENBQUNlLEtBQUssQ0FBQ3FLLFdBQVcsQ0FBQyxnQ0FBZ0MsRUFDL0I7RUFBRUMsTUFBTSxFQUFFLElBQUk7RUFBRUMsTUFBTSxFQUFFO0FBQUssQ0FBQyxDQUFDLEMiLCJmaWxlIjoiL3BhY2thZ2VzL2FjY291bnRzLXBhc3N3b3JkLmpzIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgZ3JlZXQgPSB3ZWxjb21lTXNnID0+ICh1c2VyLCB1cmwpID0+IHtcbiAgY29uc3QgZ3JlZXRpbmcgPVxuICAgIHVzZXIucHJvZmlsZSAmJiB1c2VyLnByb2ZpbGUubmFtZVxuICAgICAgPyBgSGVsbG8gJHt1c2VyLnByb2ZpbGUubmFtZX0sYFxuICAgICAgOiAnSGVsbG8sJztcbiAgcmV0dXJuIGAke2dyZWV0aW5nfVxuXG4ke3dlbGNvbWVNc2d9LCBzaW1wbHkgY2xpY2sgdGhlIGxpbmsgYmVsb3cuXG5cbiR7dXJsfVxuXG5UaGFuayB5b3UuXG5gO1xufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBPcHRpb25zIHRvIGN1c3RvbWl6ZSBlbWFpbHMgc2VudCBmcm9tIHRoZSBBY2NvdW50cyBzeXN0ZW0uXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgYWNjb3VudHMtYmFzZVxuICovXG5BY2NvdW50cy5lbWFpbFRlbXBsYXRlcyA9IHtcbiAgLi4uKEFjY291bnRzLmVtYWlsVGVtcGxhdGVzIHx8IHt9KSxcbiAgZnJvbTogJ0FjY291bnRzIEV4YW1wbGUgPG5vLXJlcGx5QGV4YW1wbGUuY29tPicsXG4gIHNpdGVOYW1lOiBNZXRlb3IuYWJzb2x1dGVVcmwoKVxuICAgIC5yZXBsYWNlKC9eaHR0cHM/OlxcL1xcLy8sICcnKVxuICAgIC5yZXBsYWNlKC9cXC8kLywgJycpLFxuXG4gIHJlc2V0UGFzc3dvcmQ6IHtcbiAgICBzdWJqZWN0OiAoKSA9PlxuICAgICAgYEhvdyB0byByZXNldCB5b3VyIHBhc3N3b3JkIG9uICR7QWNjb3VudHMuZW1haWxUZW1wbGF0ZXMuc2l0ZU5hbWV9YCxcbiAgICB0ZXh0OiBncmVldCgnVG8gcmVzZXQgeW91ciBwYXNzd29yZCcpLFxuICB9LFxuICB2ZXJpZnlFbWFpbDoge1xuICAgIHN1YmplY3Q6ICgpID0+XG4gICAgICBgSG93IHRvIHZlcmlmeSBlbWFpbCBhZGRyZXNzIG9uICR7QWNjb3VudHMuZW1haWxUZW1wbGF0ZXMuc2l0ZU5hbWV9YCxcbiAgICB0ZXh0OiBncmVldCgnVG8gdmVyaWZ5IHlvdXIgYWNjb3VudCBlbWFpbCcpLFxuICB9LFxuICBlbnJvbGxBY2NvdW50OiB7XG4gICAgc3ViamVjdDogKCkgPT5cbiAgICAgIGBBbiBhY2NvdW50IGhhcyBiZWVuIGNyZWF0ZWQgZm9yIHlvdSBvbiAke0FjY291bnRzLmVtYWlsVGVtcGxhdGVzLnNpdGVOYW1lfWAsXG4gICAgdGV4dDogZ3JlZXQoJ1RvIHN0YXJ0IHVzaW5nIHRoZSBzZXJ2aWNlJyksXG4gIH0sXG59O1xuIiwiaW1wb3J0IHsgaGFzaCBhcyBiY3J5cHRIYXNoLCBjb21wYXJlIGFzIGJjcnlwdENvbXBhcmUgfSBmcm9tICdiY3J5cHQnO1xuaW1wb3J0IHsgQWNjb3VudHMgfSBmcm9tIFwibWV0ZW9yL2FjY291bnRzLWJhc2VcIjtcblxuLy8gVXRpbGl0eSBmb3IgZ3JhYmJpbmcgdXNlclxuY29uc3QgZ2V0VXNlckJ5SWQgPSAoaWQsIG9wdGlvbnMpID0+IE1ldGVvci51c2Vycy5maW5kT25lKGlkLCBBY2NvdW50cy5fYWRkRGVmYXVsdEZpZWxkU2VsZWN0b3Iob3B0aW9ucykpO1xuXG4vLyBVc2VyIHJlY29yZHMgaGF2ZSBhICdzZXJ2aWNlcy5wYXNzd29yZC5iY3J5cHQnIGZpZWxkIG9uIHRoZW0gdG8gaG9sZFxuLy8gdGhlaXIgaGFzaGVkIHBhc3N3b3Jkcy5cbi8vXG4vLyBXaGVuIHRoZSBjbGllbnQgc2VuZHMgYSBwYXNzd29yZCB0byB0aGUgc2VydmVyLCBpdCBjYW4gZWl0aGVyIGJlIGFcbi8vIHN0cmluZyAodGhlIHBsYWludGV4dCBwYXNzd29yZCkgb3IgYW4gb2JqZWN0IHdpdGgga2V5cyAnZGlnZXN0JyBhbmRcbi8vICdhbGdvcml0aG0nIChtdXN0IGJlIFwic2hhLTI1NlwiIGZvciBub3cpLiBUaGUgTWV0ZW9yIGNsaWVudCBhbHdheXMgc2VuZHNcbi8vIHBhc3N3b3JkIG9iamVjdHMgeyBkaWdlc3Q6ICosIGFsZ29yaXRobTogXCJzaGEtMjU2XCIgfSwgYnV0IEREUCBjbGllbnRzXG4vLyB0aGF0IGRvbid0IGhhdmUgYWNjZXNzIHRvIFNIQSBjYW4ganVzdCBzZW5kIHBsYWludGV4dCBwYXNzd29yZHMgYXNcbi8vIHN0cmluZ3MuXG4vL1xuLy8gV2hlbiB0aGUgc2VydmVyIHJlY2VpdmVzIGEgcGxhaW50ZXh0IHBhc3N3b3JkIGFzIGEgc3RyaW5nLCBpdCBhbHdheXNcbi8vIGhhc2hlcyBpdCB3aXRoIFNIQTI1NiBiZWZvcmUgcGFzc2luZyBpdCBpbnRvIGJjcnlwdC4gV2hlbiB0aGUgc2VydmVyXG4vLyByZWNlaXZlcyBhIHBhc3N3b3JkIGFzIGFuIG9iamVjdCwgaXQgYXNzZXJ0cyB0aGF0IHRoZSBhbGdvcml0aG0gaXNcbi8vIFwic2hhLTI1NlwiIGFuZCB0aGVuIHBhc3NlcyB0aGUgZGlnZXN0IHRvIGJjcnlwdC5cblxuXG5BY2NvdW50cy5fYmNyeXB0Um91bmRzID0gKCkgPT4gQWNjb3VudHMuX29wdGlvbnMuYmNyeXB0Um91bmRzIHx8IDEwO1xuXG4vLyBHaXZlbiBhICdwYXNzd29yZCcgZnJvbSB0aGUgY2xpZW50LCBleHRyYWN0IHRoZSBzdHJpbmcgdGhhdCB3ZSBzaG91bGRcbi8vIGJjcnlwdC4gJ3Bhc3N3b3JkJyBjYW4gYmUgb25lIG9mOlxuLy8gIC0gU3RyaW5nICh0aGUgcGxhaW50ZXh0IHBhc3N3b3JkKVxuLy8gIC0gT2JqZWN0IHdpdGggJ2RpZ2VzdCcgYW5kICdhbGdvcml0aG0nIGtleXMuICdhbGdvcml0aG0nIG11c3QgYmUgXCJzaGEtMjU2XCIuXG4vL1xuY29uc3QgZ2V0UGFzc3dvcmRTdHJpbmcgPSBwYXNzd29yZCA9PiB7XG4gIGlmICh0eXBlb2YgcGFzc3dvcmQgPT09IFwic3RyaW5nXCIpIHtcbiAgICBwYXNzd29yZCA9IFNIQTI1NihwYXNzd29yZCk7XG4gIH0gZWxzZSB7IC8vICdwYXNzd29yZCcgaXMgYW4gb2JqZWN0XG4gICAgaWYgKHBhc3N3b3JkLmFsZ29yaXRobSAhPT0gXCJzaGEtMjU2XCIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgcGFzc3dvcmQgaGFzaCBhbGdvcml0aG0uIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICBcIk9ubHkgJ3NoYS0yNTYnIGlzIGFsbG93ZWQuXCIpO1xuICAgIH1cbiAgICBwYXNzd29yZCA9IHBhc3N3b3JkLmRpZ2VzdDtcbiAgfVxuICByZXR1cm4gcGFzc3dvcmQ7XG59O1xuXG4vLyBVc2UgYmNyeXB0IHRvIGhhc2ggdGhlIHBhc3N3b3JkIGZvciBzdG9yYWdlIGluIHRoZSBkYXRhYmFzZS5cbi8vIGBwYXNzd29yZGAgY2FuIGJlIGEgc3RyaW5nIChpbiB3aGljaCBjYXNlIGl0IHdpbGwgYmUgcnVuIHRocm91Z2hcbi8vIFNIQTI1NiBiZWZvcmUgYmNyeXB0KSBvciBhbiBvYmplY3Qgd2l0aCBwcm9wZXJ0aWVzIGBkaWdlc3RgIGFuZFxuLy8gYGFsZ29yaXRobWAgKGluIHdoaWNoIGNhc2Ugd2UgYmNyeXB0IGBwYXNzd29yZC5kaWdlc3RgKS5cbi8vXG5jb25zdCBoYXNoUGFzc3dvcmQgPSBhc3luYyBwYXNzd29yZCA9PiB7XG4gIHBhc3N3b3JkID0gZ2V0UGFzc3dvcmRTdHJpbmcocGFzc3dvcmQpO1xuICByZXR1cm4gYXdhaXQgYmNyeXB0SGFzaChwYXNzd29yZCwgQWNjb3VudHMuX2JjcnlwdFJvdW5kcygpKTtcbn07XG5cbi8vIEV4dHJhY3QgdGhlIG51bWJlciBvZiByb3VuZHMgdXNlZCBpbiB0aGUgc3BlY2lmaWVkIGJjcnlwdCBoYXNoLlxuY29uc3QgZ2V0Um91bmRzRnJvbUJjcnlwdEhhc2ggPSBoYXNoID0+IHtcbiAgbGV0IHJvdW5kcztcbiAgaWYgKGhhc2gpIHtcbiAgICBjb25zdCBoYXNoU2VnbWVudHMgPSBoYXNoLnNwbGl0KCckJyk7XG4gICAgaWYgKGhhc2hTZWdtZW50cy5sZW5ndGggPiAyKSB7XG4gICAgICByb3VuZHMgPSBwYXJzZUludChoYXNoU2VnbWVudHNbMl0sIDEwKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJvdW5kcztcbn07XG5cbi8vIENoZWNrIHdoZXRoZXIgdGhlIHByb3ZpZGVkIHBhc3N3b3JkIG1hdGNoZXMgdGhlIGJjcnlwdCdlZCBwYXNzd29yZCBpblxuLy8gdGhlIGRhdGFiYXNlIHVzZXIgcmVjb3JkLiBgcGFzc3dvcmRgIGNhbiBiZSBhIHN0cmluZyAoaW4gd2hpY2ggY2FzZVxuLy8gaXQgd2lsbCBiZSBydW4gdGhyb3VnaCBTSEEyNTYgYmVmb3JlIGJjcnlwdCkgb3IgYW4gb2JqZWN0IHdpdGhcbi8vIHByb3BlcnRpZXMgYGRpZ2VzdGAgYW5kIGBhbGdvcml0aG1gIChpbiB3aGljaCBjYXNlIHdlIGJjcnlwdFxuLy8gYHBhc3N3b3JkLmRpZ2VzdGApLlxuLy9cbi8vIFRoZSB1c2VyIHBhcmFtZXRlciBuZWVkcyBhdCBsZWFzdCB1c2VyLl9pZCBhbmQgdXNlci5zZXJ2aWNlc1xuQWNjb3VudHMuX2NoZWNrUGFzc3dvcmRVc2VyRmllbGRzID0ge19pZDogMSwgc2VydmljZXM6IDF9O1xuLy9cbmNvbnN0IGNoZWNrUGFzc3dvcmRBc3luYyA9IGFzeW5jICh1c2VyLCBwYXNzd29yZCkgPT4ge1xuICBjb25zdCByZXN1bHQgPSB7XG4gICAgdXNlcklkOiB1c2VyLl9pZFxuICB9O1xuXG4gIGNvbnN0IGZvcm1hdHRlZFBhc3N3b3JkID0gZ2V0UGFzc3dvcmRTdHJpbmcocGFzc3dvcmQpO1xuICBjb25zdCBoYXNoID0gdXNlci5zZXJ2aWNlcy5wYXNzd29yZC5iY3J5cHQ7XG4gIGNvbnN0IGhhc2hSb3VuZHMgPSBnZXRSb3VuZHNGcm9tQmNyeXB0SGFzaChoYXNoKTtcblxuICBpZiAoISBhd2FpdCBiY3J5cHRDb21wYXJlKGZvcm1hdHRlZFBhc3N3b3JkLCBoYXNoKSkge1xuICAgIHJlc3VsdC5lcnJvciA9IEFjY291bnRzLl9oYW5kbGVFcnJvcihcIkluY29ycmVjdCBwYXNzd29yZFwiLCBmYWxzZSk7XG4gIH0gZWxzZSBpZiAoaGFzaCAmJiBBY2NvdW50cy5fYmNyeXB0Um91bmRzKCkgIT0gaGFzaFJvdW5kcykge1xuICAgIC8vIFRoZSBwYXNzd29yZCBjaGVja3Mgb3V0LCBidXQgdGhlIHVzZXIncyBiY3J5cHQgaGFzaCBuZWVkcyB0byBiZSB1cGRhdGVkLlxuXG4gICAgTWV0ZW9yLmRlZmVyKGFzeW5jICgpID0+IHtcbiAgICAgIE1ldGVvci51c2Vycy51cGRhdGUoeyBfaWQ6IHVzZXIuX2lkIH0sIHtcbiAgICAgICAgJHNldDoge1xuICAgICAgICAgICdzZXJ2aWNlcy5wYXNzd29yZC5iY3J5cHQnOlxuICAgICAgICAgICAgYXdhaXQgYmNyeXB0SGFzaChmb3JtYXR0ZWRQYXNzd29yZCwgQWNjb3VudHMuX2JjcnlwdFJvdW5kcygpKVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5jb25zdCBjaGVja1Bhc3N3b3JkID0gKHVzZXIsIHBhc3N3b3JkKSA9PiB7XG4gIHJldHVybiBQcm9taXNlLmF3YWl0KGNoZWNrUGFzc3dvcmRBc3luYyh1c2VyLCBwYXNzd29yZCkpO1xufTtcblxuQWNjb3VudHMuX2NoZWNrUGFzc3dvcmQgPSBjaGVja1Bhc3N3b3JkO1xuQWNjb3VudHMuX2NoZWNrUGFzc3dvcmRBc3luYyA9ICBjaGVja1Bhc3N3b3JkQXN5bmM7XG5cbi8vL1xuLy8vIExPR0lOXG4vLy9cblxuXG4vKipcbiAqIEBzdW1tYXJ5IEZpbmRzIHRoZSB1c2VyIHdpdGggdGhlIHNwZWNpZmllZCB1c2VybmFtZS5cbiAqIEZpcnN0IHRyaWVzIHRvIG1hdGNoIHVzZXJuYW1lIGNhc2Ugc2Vuc2l0aXZlbHk7IGlmIHRoYXQgZmFpbHMsIGl0XG4gKiB0cmllcyBjYXNlIGluc2Vuc2l0aXZlbHk7IGJ1dCBpZiBtb3JlIHRoYW4gb25lIHVzZXIgbWF0Y2hlcyB0aGUgY2FzZVxuICogaW5zZW5zaXRpdmUgc2VhcmNoLCBpdCByZXR1cm5zIG51bGwuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlcm5hbWUgVGhlIHVzZXJuYW1lIHRvIGxvb2sgZm9yXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gKiBAcGFyYW0ge01vbmdvRmllbGRTcGVjaWZpZXJ9IG9wdGlvbnMuZmllbGRzIERpY3Rpb25hcnkgb2YgZmllbGRzIHRvIHJldHVybiBvciBleGNsdWRlLlxuICogQHJldHVybnMge09iamVjdH0gQSB1c2VyIGlmIGZvdW5kLCBlbHNlIG51bGxcbiAqIEBpbXBvcnRGcm9tUGFja2FnZSBhY2NvdW50cy1iYXNlXG4gKi9cbkFjY291bnRzLmZpbmRVc2VyQnlVc2VybmFtZSA9XG4gICh1c2VybmFtZSwgb3B0aW9ucykgPT4gQWNjb3VudHMuX2ZpbmRVc2VyQnlRdWVyeSh7IHVzZXJuYW1lIH0sIG9wdGlvbnMpO1xuXG4vKipcbiAqIEBzdW1tYXJ5IEZpbmRzIHRoZSB1c2VyIHdpdGggdGhlIHNwZWNpZmllZCBlbWFpbC5cbiAqIEZpcnN0IHRyaWVzIHRvIG1hdGNoIGVtYWlsIGNhc2Ugc2Vuc2l0aXZlbHk7IGlmIHRoYXQgZmFpbHMsIGl0XG4gKiB0cmllcyBjYXNlIGluc2Vuc2l0aXZlbHk7IGJ1dCBpZiBtb3JlIHRoYW4gb25lIHVzZXIgbWF0Y2hlcyB0aGUgY2FzZVxuICogaW5zZW5zaXRpdmUgc2VhcmNoLCBpdCByZXR1cm5zIG51bGwuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge1N0cmluZ30gZW1haWwgVGhlIGVtYWlsIGFkZHJlc3MgdG8gbG9vayBmb3JcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7TW9uZ29GaWVsZFNwZWNpZmllcn0gb3B0aW9ucy5maWVsZHMgRGljdGlvbmFyeSBvZiBmaWVsZHMgdG8gcmV0dXJuIG9yIGV4Y2x1ZGUuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBBIHVzZXIgaWYgZm91bmQsIGVsc2UgbnVsbFxuICogQGltcG9ydEZyb21QYWNrYWdlIGFjY291bnRzLWJhc2VcbiAqL1xuQWNjb3VudHMuZmluZFVzZXJCeUVtYWlsID1cbiAgKGVtYWlsLCBvcHRpb25zKSA9PiBBY2NvdW50cy5fZmluZFVzZXJCeVF1ZXJ5KHsgZW1haWwgfSwgb3B0aW9ucyk7XG5cbi8vIFhYWCBtYXliZSB0aGlzIGJlbG9uZ3MgaW4gdGhlIGNoZWNrIHBhY2thZ2VcbmNvbnN0IE5vbkVtcHR5U3RyaW5nID0gTWF0Y2guV2hlcmUoeCA9PiB7XG4gIGNoZWNrKHgsIFN0cmluZyk7XG4gIHJldHVybiB4Lmxlbmd0aCA+IDA7XG59KTtcblxuY29uc3QgcGFzc3dvcmRWYWxpZGF0b3IgPSBNYXRjaC5PbmVPZihcbiAgTWF0Y2guV2hlcmUoc3RyID0+IE1hdGNoLnRlc3Qoc3RyLCBTdHJpbmcpICYmIHN0ci5sZW5ndGggPD0gTWV0ZW9yLnNldHRpbmdzPy5wYWNrYWdlcz8uYWNjb3VudHM/LnBhc3N3b3JkTWF4TGVuZ3RoIHx8IDI1NiksIHtcbiAgICBkaWdlc3Q6IE1hdGNoLldoZXJlKHN0ciA9PiBNYXRjaC50ZXN0KHN0ciwgU3RyaW5nKSAmJiBzdHIubGVuZ3RoID09PSA2NCksXG4gICAgYWxnb3JpdGhtOiBNYXRjaC5PbmVPZignc2hhLTI1NicpXG4gIH1cbik7XG5cbi8vIEhhbmRsZXIgdG8gbG9naW4gd2l0aCBhIHBhc3N3b3JkLlxuLy9cbi8vIFRoZSBNZXRlb3IgY2xpZW50IHNldHMgb3B0aW9ucy5wYXNzd29yZCB0byBhbiBvYmplY3Qgd2l0aCBrZXlzXG4vLyAnZGlnZXN0JyAoc2V0IHRvIFNIQTI1NihwYXNzd29yZCkpIGFuZCAnYWxnb3JpdGhtJyAoXCJzaGEtMjU2XCIpLlxuLy9cbi8vIEZvciBvdGhlciBERFAgY2xpZW50cyB3aGljaCBkb24ndCBoYXZlIGFjY2VzcyB0byBTSEEsIHRoZSBoYW5kbGVyXG4vLyBhbHNvIGFjY2VwdHMgdGhlIHBsYWludGV4dCBwYXNzd29yZCBpbiBvcHRpb25zLnBhc3N3b3JkIGFzIGEgc3RyaW5nLlxuLy9cbi8vIChJdCBtaWdodCBiZSBuaWNlIGlmIHNlcnZlcnMgY291bGQgdHVybiB0aGUgcGxhaW50ZXh0IHBhc3N3b3JkXG4vLyBvcHRpb24gb2ZmLiBPciBtYXliZSBpdCBzaG91bGQgYmUgb3B0LWluLCBub3Qgb3B0LW91dD9cbi8vIEFjY291bnRzLmNvbmZpZyBvcHRpb24/KVxuLy9cbi8vIE5vdGUgdGhhdCBuZWl0aGVyIHBhc3N3b3JkIG9wdGlvbiBpcyBzZWN1cmUgd2l0aG91dCBTU0wuXG4vL1xuQWNjb3VudHMucmVnaXN0ZXJMb2dpbkhhbmRsZXIoXCJwYXNzd29yZFwiLCBhc3luYyBvcHRpb25zID0+IHtcbiAgaWYgKCFvcHRpb25zLnBhc3N3b3JkKVxuICAgIHJldHVybiB1bmRlZmluZWQ7IC8vIGRvbid0IGhhbmRsZVxuXG4gIGNoZWNrKG9wdGlvbnMsIHtcbiAgICB1c2VyOiBBY2NvdW50cy5fdXNlclF1ZXJ5VmFsaWRhdG9yLFxuICAgIHBhc3N3b3JkOiBwYXNzd29yZFZhbGlkYXRvcixcbiAgICBjb2RlOiBNYXRjaC5PcHRpb25hbChOb25FbXB0eVN0cmluZyksXG4gIH0pO1xuXG5cbiAgY29uc3QgdXNlciA9IEFjY291bnRzLl9maW5kVXNlckJ5UXVlcnkob3B0aW9ucy51c2VyLCB7ZmllbGRzOiB7XG4gICAgc2VydmljZXM6IDEsXG4gICAgLi4uQWNjb3VudHMuX2NoZWNrUGFzc3dvcmRVc2VyRmllbGRzLFxuICB9fSk7XG4gIGlmICghdXNlcikge1xuICAgIEFjY291bnRzLl9oYW5kbGVFcnJvcihcIlVzZXIgbm90IGZvdW5kXCIpO1xuICB9XG5cblxuICBpZiAoIXVzZXIuc2VydmljZXMgfHwgIXVzZXIuc2VydmljZXMucGFzc3dvcmQgfHxcbiAgICAgICF1c2VyLnNlcnZpY2VzLnBhc3N3b3JkLmJjcnlwdCkge1xuICAgIEFjY291bnRzLl9oYW5kbGVFcnJvcihcIlVzZXIgaGFzIG5vIHBhc3N3b3JkIHNldFwiKTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNoZWNrUGFzc3dvcmRBc3luYyh1c2VyLCBvcHRpb25zLnBhc3N3b3JkKTtcbiAgLy8gVGhpcyBtZXRob2QgaXMgYWRkZWQgYnkgdGhlIHBhY2thZ2UgYWNjb3VudHMtMmZhXG4gIC8vIEZpcnN0IHRoZSBsb2dpbiBpcyB2YWxpZGF0ZWQsIHRoZW4gdGhlIGNvZGUgc2l0dWF0aW9uIGlzIGNoZWNrZWRcbiAgaWYgKFxuICAgICFyZXN1bHQuZXJyb3IgJiZcbiAgICBBY2NvdW50cy5fY2hlY2syZmFFbmFibGVkPy4odXNlcilcbiAgKSB7XG4gICAgaWYgKCFvcHRpb25zLmNvZGUpIHtcbiAgICAgIEFjY291bnRzLl9oYW5kbGVFcnJvcignMkZBIGNvZGUgbXVzdCBiZSBpbmZvcm1lZCcsIHRydWUsICduby0yZmEtY29kZScpO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICAhQWNjb3VudHMuX2lzVG9rZW5WYWxpZChcbiAgICAgICAgdXNlci5zZXJ2aWNlcy50d29GYWN0b3JBdXRoZW50aWNhdGlvbi5zZWNyZXQsXG4gICAgICAgIG9wdGlvbnMuY29kZVxuICAgICAgKVxuICAgICkge1xuICAgICAgQWNjb3VudHMuX2hhbmRsZUVycm9yKCdJbnZhbGlkIDJGQSBjb2RlJywgdHJ1ZSwgJ2ludmFsaWQtMmZhLWNvZGUnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufSk7XG5cbi8vL1xuLy8vIENIQU5HSU5HXG4vLy9cblxuLyoqXG4gKiBAc3VtbWFyeSBDaGFuZ2UgYSB1c2VyJ3MgdXNlcm5hbWUuIFVzZSB0aGlzIGluc3RlYWQgb2YgdXBkYXRpbmcgdGhlXG4gKiBkYXRhYmFzZSBkaXJlY3RseS4gVGhlIG9wZXJhdGlvbiB3aWxsIGZhaWwgaWYgdGhlcmUgaXMgYW4gZXhpc3RpbmcgdXNlclxuICogd2l0aCBhIHVzZXJuYW1lIG9ubHkgZGlmZmVyaW5nIGluIGNhc2UuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlcklkIFRoZSBJRCBvZiB0aGUgdXNlciB0byB1cGRhdGUuXG4gKiBAcGFyYW0ge1N0cmluZ30gbmV3VXNlcm5hbWUgQSBuZXcgdXNlcm5hbWUgZm9yIHRoZSB1c2VyLlxuICogQGltcG9ydEZyb21QYWNrYWdlIGFjY291bnRzLWJhc2VcbiAqL1xuQWNjb3VudHMuc2V0VXNlcm5hbWUgPSAodXNlcklkLCBuZXdVc2VybmFtZSkgPT4ge1xuICBjaGVjayh1c2VySWQsIE5vbkVtcHR5U3RyaW5nKTtcbiAgY2hlY2sobmV3VXNlcm5hbWUsIE5vbkVtcHR5U3RyaW5nKTtcblxuICBjb25zdCB1c2VyID0gZ2V0VXNlckJ5SWQodXNlcklkLCB7ZmllbGRzOiB7XG4gICAgdXNlcm5hbWU6IDEsXG4gIH19KTtcbiAgaWYgKCF1c2VyKSB7XG4gICAgQWNjb3VudHMuX2hhbmRsZUVycm9yKFwiVXNlciBub3QgZm91bmRcIik7XG4gIH1cblxuICBjb25zdCBvbGRVc2VybmFtZSA9IHVzZXIudXNlcm5hbWU7XG5cbiAgLy8gUGVyZm9ybSBhIGNhc2UgaW5zZW5zaXRpdmUgY2hlY2sgZm9yIGR1cGxpY2F0ZXMgYmVmb3JlIHVwZGF0ZVxuICBBY2NvdW50cy5fY2hlY2tGb3JDYXNlSW5zZW5zaXRpdmVEdXBsaWNhdGVzKCd1c2VybmFtZScsXG4gICAgJ1VzZXJuYW1lJywgbmV3VXNlcm5hbWUsIHVzZXIuX2lkKTtcblxuICBNZXRlb3IudXNlcnMudXBkYXRlKHtfaWQ6IHVzZXIuX2lkfSwgeyRzZXQ6IHt1c2VybmFtZTogbmV3VXNlcm5hbWV9fSk7XG5cbiAgLy8gUGVyZm9ybSBhbm90aGVyIGNoZWNrIGFmdGVyIHVwZGF0ZSwgaW4gY2FzZSBhIG1hdGNoaW5nIHVzZXIgaGFzIGJlZW5cbiAgLy8gaW5zZXJ0ZWQgaW4gdGhlIG1lYW50aW1lXG4gIHRyeSB7XG4gICAgQWNjb3VudHMuX2NoZWNrRm9yQ2FzZUluc2Vuc2l0aXZlRHVwbGljYXRlcygndXNlcm5hbWUnLFxuICAgICAgJ1VzZXJuYW1lJywgbmV3VXNlcm5hbWUsIHVzZXIuX2lkKTtcbiAgfSBjYXRjaCAoZXgpIHtcbiAgICAvLyBVbmRvIHVwZGF0ZSBpZiB0aGUgY2hlY2sgZmFpbHNcbiAgICBNZXRlb3IudXNlcnMudXBkYXRlKHtfaWQ6IHVzZXIuX2lkfSwgeyRzZXQ6IHt1c2VybmFtZTogb2xkVXNlcm5hbWV9fSk7XG4gICAgdGhyb3cgZXg7XG4gIH1cbn07XG5cbi8vIExldCB0aGUgdXNlciBjaGFuZ2UgdGhlaXIgb3duIHBhc3N3b3JkIGlmIHRoZXkga25vdyB0aGUgb2xkXG4vLyBwYXNzd29yZC4gYG9sZFBhc3N3b3JkYCBhbmQgYG5ld1Bhc3N3b3JkYCBzaG91bGQgYmUgb2JqZWN0cyB3aXRoIGtleXNcbi8vIGBkaWdlc3RgIGFuZCBgYWxnb3JpdGhtYCAocmVwcmVzZW50aW5nIHRoZSBTSEEyNTYgb2YgdGhlIHBhc3N3b3JkKS5cbk1ldGVvci5tZXRob2RzKHtjaGFuZ2VQYXNzd29yZDogYXN5bmMgZnVuY3Rpb24gKG9sZFBhc3N3b3JkLCBuZXdQYXNzd29yZCkge1xuICBjaGVjayhvbGRQYXNzd29yZCwgcGFzc3dvcmRWYWxpZGF0b3IpO1xuICBjaGVjayhuZXdQYXNzd29yZCwgcGFzc3dvcmRWYWxpZGF0b3IpO1xuXG4gIGlmICghdGhpcy51c2VySWQpIHtcbiAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKDQwMSwgXCJNdXN0IGJlIGxvZ2dlZCBpblwiKTtcbiAgfVxuXG4gIGNvbnN0IHVzZXIgPSBnZXRVc2VyQnlJZCh0aGlzLnVzZXJJZCwge2ZpZWxkczoge1xuICAgIHNlcnZpY2VzOiAxLFxuICAgIC4uLkFjY291bnRzLl9jaGVja1Bhc3N3b3JkVXNlckZpZWxkcyxcbiAgfX0pO1xuICBpZiAoIXVzZXIpIHtcbiAgICBBY2NvdW50cy5faGFuZGxlRXJyb3IoXCJVc2VyIG5vdCBmb3VuZFwiKTtcbiAgfVxuXG4gIGlmICghdXNlci5zZXJ2aWNlcyB8fCAhdXNlci5zZXJ2aWNlcy5wYXNzd29yZCB8fCAhdXNlci5zZXJ2aWNlcy5wYXNzd29yZC5iY3J5cHQpIHtcbiAgICBBY2NvdW50cy5faGFuZGxlRXJyb3IoXCJVc2VyIGhhcyBubyBwYXNzd29yZCBzZXRcIik7XG4gIH1cblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaGVja1Bhc3N3b3JkQXN5bmModXNlciwgb2xkUGFzc3dvcmQpO1xuICBpZiAocmVzdWx0LmVycm9yKSB7XG4gICAgdGhyb3cgcmVzdWx0LmVycm9yO1xuICB9XG5cbiAgY29uc3QgaGFzaGVkID0gYXdhaXQgaGFzaFBhc3N3b3JkKG5ld1Bhc3N3b3JkKTtcblxuICAvLyBJdCB3b3VsZCBiZSBiZXR0ZXIgaWYgdGhpcyByZW1vdmVkIEFMTCBleGlzdGluZyB0b2tlbnMgYW5kIHJlcGxhY2VkXG4gIC8vIHRoZSB0b2tlbiBmb3IgdGhlIGN1cnJlbnQgY29ubmVjdGlvbiB3aXRoIGEgbmV3IG9uZSwgYnV0IHRoYXQgd291bGRcbiAgLy8gYmUgdHJpY2t5LCBzbyB3ZSdsbCBzZXR0bGUgZm9yIGp1c3QgcmVwbGFjaW5nIGFsbCB0b2tlbnMgb3RoZXIgdGhhblxuICAvLyB0aGUgb25lIGZvciB0aGUgY3VycmVudCBjb25uZWN0aW9uLlxuICBjb25zdCBjdXJyZW50VG9rZW4gPSBBY2NvdW50cy5fZ2V0TG9naW5Ub2tlbih0aGlzLmNvbm5lY3Rpb24uaWQpO1xuICBNZXRlb3IudXNlcnMudXBkYXRlKFxuICAgIHsgX2lkOiB0aGlzLnVzZXJJZCB9LFxuICAgIHtcbiAgICAgICRzZXQ6IHsgJ3NlcnZpY2VzLnBhc3N3b3JkLmJjcnlwdCc6IGhhc2hlZCB9LFxuICAgICAgJHB1bGw6IHtcbiAgICAgICAgJ3NlcnZpY2VzLnJlc3VtZS5sb2dpblRva2Vucyc6IHsgaGFzaGVkVG9rZW46IHsgJG5lOiBjdXJyZW50VG9rZW4gfSB9XG4gICAgICB9LFxuICAgICAgJHVuc2V0OiB7ICdzZXJ2aWNlcy5wYXNzd29yZC5yZXNldCc6IDEgfVxuICAgIH1cbiAgKTtcblxuICByZXR1cm4ge3Bhc3N3b3JkQ2hhbmdlZDogdHJ1ZX07XG59fSk7XG5cblxuLy8gRm9yY2UgY2hhbmdlIHRoZSB1c2VycyBwYXNzd29yZC5cblxuLyoqXG4gKiBAc3VtbWFyeSBGb3JjaWJseSBjaGFuZ2UgdGhlIHBhc3N3b3JkIGZvciBhIHVzZXIuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlcklkIFRoZSBpZCBvZiB0aGUgdXNlciB0byB1cGRhdGUuXG4gKiBAcGFyYW0ge1N0cmluZ30gbmV3UGFzc3dvcmQgQSBuZXcgcGFzc3dvcmQgZm9yIHRoZSB1c2VyLlxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMubG9nb3V0IExvZ291dCBhbGwgY3VycmVudCBjb25uZWN0aW9ucyB3aXRoIHRoaXMgdXNlcklkIChkZWZhdWx0OiB0cnVlKVxuICogQGltcG9ydEZyb21QYWNrYWdlIGFjY291bnRzLWJhc2VcbiAqL1xuQWNjb3VudHMuc2V0UGFzc3dvcmRBc3luYyA9IGFzeW5jICh1c2VySWQsIG5ld1BsYWludGV4dFBhc3N3b3JkLCBvcHRpb25zKSA9PiB7XG4gIGNoZWNrKHVzZXJJZCwgU3RyaW5nKTtcbiAgY2hlY2sobmV3UGxhaW50ZXh0UGFzc3dvcmQsIE1hdGNoLldoZXJlKHN0ciA9PiBNYXRjaC50ZXN0KHN0ciwgU3RyaW5nKSAmJiBzdHIubGVuZ3RoIDw9IE1ldGVvci5zZXR0aW5ncz8ucGFja2FnZXM/LmFjY291bnRzPy5wYXNzd29yZE1heExlbmd0aCB8fCAyNTYpKTtcbiAgY2hlY2sob3B0aW9ucywgTWF0Y2guTWF5YmUoeyBsb2dvdXQ6IEJvb2xlYW4gfSkpO1xuICBvcHRpb25zID0geyBsb2dvdXQ6IHRydWUgLCAuLi5vcHRpb25zIH07XG5cbiAgY29uc3QgdXNlciA9IGdldFVzZXJCeUlkKHVzZXJJZCwge2ZpZWxkczoge19pZDogMX19KTtcbiAgaWYgKCF1c2VyKSB7XG4gICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiVXNlciBub3QgZm91bmRcIik7XG4gIH1cblxuICBjb25zdCB1cGRhdGUgPSB7XG4gICAgJHVuc2V0OiB7XG4gICAgICAnc2VydmljZXMucGFzc3dvcmQucmVzZXQnOiAxXG4gICAgfSxcbiAgICAkc2V0OiB7J3NlcnZpY2VzLnBhc3N3b3JkLmJjcnlwdCc6IGF3YWl0IGhhc2hQYXNzd29yZChuZXdQbGFpbnRleHRQYXNzd29yZCl9XG4gIH07XG5cbiAgaWYgKG9wdGlvbnMubG9nb3V0KSB7XG4gICAgdXBkYXRlLiR1bnNldFsnc2VydmljZXMucmVzdW1lLmxvZ2luVG9rZW5zJ10gPSAxO1xuICB9XG5cbiAgTWV0ZW9yLnVzZXJzLnVwZGF0ZSh7X2lkOiB1c2VyLl9pZH0sIHVwZGF0ZSk7XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IEZvcmNpYmx5IGNoYW5nZSB0aGUgcGFzc3dvcmQgZm9yIGEgdXNlci5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VySWQgVGhlIGlkIG9mIHRoZSB1c2VyIHRvIHVwZGF0ZS5cbiAqIEBwYXJhbSB7U3RyaW5nfSBuZXdQYXNzd29yZCBBIG5ldyBwYXNzd29yZCBmb3IgdGhlIHVzZXIuXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucy5sb2dvdXQgTG9nb3V0IGFsbCBjdXJyZW50IGNvbm5lY3Rpb25zIHdpdGggdGhpcyB1c2VySWQgKGRlZmF1bHQ6IHRydWUpXG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgYWNjb3VudHMtYmFzZVxuICovXG5BY2NvdW50cy5zZXRQYXNzd29yZCA9ICh1c2VySWQsIG5ld1BsYWludGV4dFBhc3N3b3JkLCBvcHRpb25zKSA9PiB7XG4gIHJldHVybiBQcm9taXNlLmF3YWl0KEFjY291bnRzLnNldFBhc3N3b3JkQXN5bmModXNlcklkLCBuZXdQbGFpbnRleHRQYXNzd29yZCwgb3B0aW9ucykpO1xufTtcblxuXG4vLy9cbi8vLyBSRVNFVFRJTkcgVklBIEVNQUlMXG4vLy9cblxuLy8gVXRpbGl0eSBmb3IgcGx1Y2tpbmcgYWRkcmVzc2VzIGZyb20gZW1haWxzXG5jb25zdCBwbHVja0FkZHJlc3NlcyA9IChlbWFpbHMgPSBbXSkgPT4gZW1haWxzLm1hcChlbWFpbCA9PiBlbWFpbC5hZGRyZXNzKTtcblxuLy8gTWV0aG9kIGNhbGxlZCBieSBhIHVzZXIgdG8gcmVxdWVzdCBhIHBhc3N3b3JkIHJlc2V0IGVtYWlsLiBUaGlzIGlzXG4vLyB0aGUgc3RhcnQgb2YgdGhlIHJlc2V0IHByb2Nlc3MuXG5NZXRlb3IubWV0aG9kcyh7Zm9yZ290UGFzc3dvcmQ6IG9wdGlvbnMgPT4ge1xuICBjaGVjayhvcHRpb25zLCB7ZW1haWw6IFN0cmluZ30pXG5cbiAgY29uc3QgdXNlciA9IEFjY291bnRzLmZpbmRVc2VyQnlFbWFpbChvcHRpb25zLmVtYWlsLCB7IGZpZWxkczogeyBlbWFpbHM6IDEgfSB9KTtcblxuICBpZiAoIXVzZXIpIHtcbiAgICBBY2NvdW50cy5faGFuZGxlRXJyb3IoXCJVc2VyIG5vdCBmb3VuZFwiKTtcbiAgfVxuXG4gIGNvbnN0IGVtYWlscyA9IHBsdWNrQWRkcmVzc2VzKHVzZXIuZW1haWxzKTtcbiAgY29uc3QgY2FzZVNlbnNpdGl2ZUVtYWlsID0gZW1haWxzLmZpbmQoXG4gICAgZW1haWwgPT4gZW1haWwudG9Mb3dlckNhc2UoKSA9PT0gb3B0aW9ucy5lbWFpbC50b0xvd2VyQ2FzZSgpXG4gICk7XG5cbiAgQWNjb3VudHMuc2VuZFJlc2V0UGFzc3dvcmRFbWFpbCh1c2VyLl9pZCwgY2FzZVNlbnNpdGl2ZUVtYWlsKTtcbn19KTtcblxuLyoqXG4gKiBAc3VtbWFyeSBHZW5lcmF0ZXMgYSByZXNldCB0b2tlbiBhbmQgc2F2ZXMgaXQgaW50byB0aGUgZGF0YWJhc2UuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlcklkIFRoZSBpZCBvZiB0aGUgdXNlciB0byBnZW5lcmF0ZSB0aGUgcmVzZXQgdG9rZW4gZm9yLlxuICogQHBhcmFtIHtTdHJpbmd9IGVtYWlsIFdoaWNoIGFkZHJlc3Mgb2YgdGhlIHVzZXIgdG8gZ2VuZXJhdGUgdGhlIHJlc2V0IHRva2VuIGZvci4gVGhpcyBhZGRyZXNzIG11c3QgYmUgaW4gdGhlIHVzZXIncyBgZW1haWxzYCBsaXN0LiBJZiBgbnVsbGAsIGRlZmF1bHRzIHRvIHRoZSBmaXJzdCBlbWFpbCBpbiB0aGUgbGlzdC5cbiAqIEBwYXJhbSB7U3RyaW5nfSByZWFzb24gYHJlc2V0UGFzc3dvcmRgIG9yIGBlbnJvbGxBY2NvdW50YC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbZXh0cmFUb2tlbkRhdGFdIE9wdGlvbmFsIGFkZGl0aW9uYWwgZGF0YSB0byBiZSBhZGRlZCBpbnRvIHRoZSB0b2tlbiByZWNvcmQuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBPYmplY3Qgd2l0aCB7ZW1haWwsIHVzZXIsIHRva2VufSB2YWx1ZXMuXG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgYWNjb3VudHMtYmFzZVxuICovXG5BY2NvdW50cy5nZW5lcmF0ZVJlc2V0VG9rZW4gPSAodXNlcklkLCBlbWFpbCwgcmVhc29uLCBleHRyYVRva2VuRGF0YSkgPT4ge1xuICAvLyBNYWtlIHN1cmUgdGhlIHVzZXIgZXhpc3RzLCBhbmQgZW1haWwgaXMgb25lIG9mIHRoZWlyIGFkZHJlc3Nlcy5cbiAgLy8gRG9uJ3QgbGltaXQgdGhlIGZpZWxkcyBpbiB0aGUgdXNlciBvYmplY3Qgc2luY2UgdGhlIHVzZXIgaXMgcmV0dXJuZWRcbiAgLy8gYnkgdGhlIGZ1bmN0aW9uIGFuZCBzb21lIG90aGVyIGZpZWxkcyBtaWdodCBiZSB1c2VkIGVsc2V3aGVyZS5cbiAgY29uc3QgdXNlciA9IGdldFVzZXJCeUlkKHVzZXJJZCk7XG4gIGlmICghdXNlcikge1xuICAgIEFjY291bnRzLl9oYW5kbGVFcnJvcihcIkNhbid0IGZpbmQgdXNlclwiKTtcbiAgfVxuXG4gIC8vIHBpY2sgdGhlIGZpcnN0IGVtYWlsIGlmIHdlIHdlcmVuJ3QgcGFzc2VkIGFuIGVtYWlsLlxuICBpZiAoIWVtYWlsICYmIHVzZXIuZW1haWxzICYmIHVzZXIuZW1haWxzWzBdKSB7XG4gICAgZW1haWwgPSB1c2VyLmVtYWlsc1swXS5hZGRyZXNzO1xuICB9XG5cbiAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYSB2YWxpZCBlbWFpbFxuICBpZiAoIWVtYWlsIHx8XG4gICAgIShwbHVja0FkZHJlc3Nlcyh1c2VyLmVtYWlscykuaW5jbHVkZXMoZW1haWwpKSkge1xuICAgIEFjY291bnRzLl9oYW5kbGVFcnJvcihcIk5vIHN1Y2ggZW1haWwgZm9yIHVzZXIuXCIpO1xuICB9XG5cbiAgY29uc3QgdG9rZW4gPSBSYW5kb20uc2VjcmV0KCk7XG4gIGNvbnN0IHRva2VuUmVjb3JkID0ge1xuICAgIHRva2VuLFxuICAgIGVtYWlsLFxuICAgIHdoZW46IG5ldyBEYXRlKClcbiAgfTtcblxuICBpZiAocmVhc29uID09PSAncmVzZXRQYXNzd29yZCcpIHtcbiAgICB0b2tlblJlY29yZC5yZWFzb24gPSAncmVzZXQnO1xuICB9IGVsc2UgaWYgKHJlYXNvbiA9PT0gJ2Vucm9sbEFjY291bnQnKSB7XG4gICAgdG9rZW5SZWNvcmQucmVhc29uID0gJ2Vucm9sbCc7XG4gIH0gZWxzZSBpZiAocmVhc29uKSB7XG4gICAgLy8gZmFsbGJhY2sgc28gdGhhdCB0aGlzIGZ1bmN0aW9uIGNhbiBiZSB1c2VkIGZvciB1bmtub3duIHJlYXNvbnMgYXMgd2VsbFxuICAgIHRva2VuUmVjb3JkLnJlYXNvbiA9IHJlYXNvbjtcbiAgfVxuXG4gIGlmIChleHRyYVRva2VuRGF0YSkge1xuICAgIE9iamVjdC5hc3NpZ24odG9rZW5SZWNvcmQsIGV4dHJhVG9rZW5EYXRhKTtcbiAgfVxuICAvLyBpZiB0aGlzIG1ldGhvZCBpcyBjYWxsZWQgZnJvbSB0aGUgZW5yb2xsIGFjY291bnQgd29yay1mbG93IHRoZW5cbiAgLy8gc3RvcmUgdGhlIHRva2VuIHJlY29yZCBpbiAnc2VydmljZXMucGFzc3dvcmQuZW5yb2xsJyBkYiBmaWVsZFxuICAvLyBlbHNlIHN0b3JlIHRoZSB0b2tlbiByZWNvcmQgaW4gaW4gJ3NlcnZpY2VzLnBhc3N3b3JkLnJlc2V0JyBkYiBmaWVsZFxuICBpZihyZWFzb24gPT09ICdlbnJvbGxBY2NvdW50Jykge1xuICAgIE1ldGVvci51c2Vycy51cGRhdGUoe19pZDogdXNlci5faWR9LCB7XG4gICAgICAkc2V0IDoge1xuICAgICAgICAnc2VydmljZXMucGFzc3dvcmQuZW5yb2xsJzogdG9rZW5SZWNvcmRcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvLyBiZWZvcmUgcGFzc2luZyB0byB0ZW1wbGF0ZSwgdXBkYXRlIHVzZXIgb2JqZWN0IHdpdGggbmV3IHRva2VuXG4gICAgTWV0ZW9yLl9lbnN1cmUodXNlciwgJ3NlcnZpY2VzJywgJ3Bhc3N3b3JkJykuZW5yb2xsID0gdG9rZW5SZWNvcmQ7XG4gIH0gZWxzZSB7XG4gICAgTWV0ZW9yLnVzZXJzLnVwZGF0ZSh7X2lkOiB1c2VyLl9pZH0sIHtcbiAgICAgICRzZXQgOiB7XG4gICAgICAgICdzZXJ2aWNlcy5wYXNzd29yZC5yZXNldCc6IHRva2VuUmVjb3JkXG4gICAgICB9XG4gICAgfSk7XG4gICAgLy8gYmVmb3JlIHBhc3NpbmcgdG8gdGVtcGxhdGUsIHVwZGF0ZSB1c2VyIG9iamVjdCB3aXRoIG5ldyB0b2tlblxuICAgIE1ldGVvci5fZW5zdXJlKHVzZXIsICdzZXJ2aWNlcycsICdwYXNzd29yZCcpLnJlc2V0ID0gdG9rZW5SZWNvcmQ7XG4gIH1cblxuICByZXR1cm4ge2VtYWlsLCB1c2VyLCB0b2tlbn07XG59O1xuXG4vKipcbiAqIEBzdW1tYXJ5IEdlbmVyYXRlcyBhbiBlLW1haWwgdmVyaWZpY2F0aW9uIHRva2VuIGFuZCBzYXZlcyBpdCBpbnRvIHRoZSBkYXRhYmFzZS5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VySWQgVGhlIGlkIG9mIHRoZSB1c2VyIHRvIGdlbmVyYXRlIHRoZSAgZS1tYWlsIHZlcmlmaWNhdGlvbiB0b2tlbiBmb3IuXG4gKiBAcGFyYW0ge1N0cmluZ30gZW1haWwgV2hpY2ggYWRkcmVzcyBvZiB0aGUgdXNlciB0byBnZW5lcmF0ZSB0aGUgZS1tYWlsIHZlcmlmaWNhdGlvbiB0b2tlbiBmb3IuIFRoaXMgYWRkcmVzcyBtdXN0IGJlIGluIHRoZSB1c2VyJ3MgYGVtYWlsc2AgbGlzdC4gSWYgYG51bGxgLCBkZWZhdWx0cyB0byB0aGUgZmlyc3QgdW52ZXJpZmllZCBlbWFpbCBpbiB0aGUgbGlzdC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbZXh0cmFUb2tlbkRhdGFdIE9wdGlvbmFsIGFkZGl0aW9uYWwgZGF0YSB0byBiZSBhZGRlZCBpbnRvIHRoZSB0b2tlbiByZWNvcmQuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBPYmplY3Qgd2l0aCB7ZW1haWwsIHVzZXIsIHRva2VufSB2YWx1ZXMuXG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgYWNjb3VudHMtYmFzZVxuICovXG5BY2NvdW50cy5nZW5lcmF0ZVZlcmlmaWNhdGlvblRva2VuID0gKHVzZXJJZCwgZW1haWwsIGV4dHJhVG9rZW5EYXRhKSA9PiB7XG4gIC8vIE1ha2Ugc3VyZSB0aGUgdXNlciBleGlzdHMsIGFuZCBlbWFpbCBpcyBvbmUgb2YgdGhlaXIgYWRkcmVzc2VzLlxuICAvLyBEb24ndCBsaW1pdCB0aGUgZmllbGRzIGluIHRoZSB1c2VyIG9iamVjdCBzaW5jZSB0aGUgdXNlciBpcyByZXR1cm5lZFxuICAvLyBieSB0aGUgZnVuY3Rpb24gYW5kIHNvbWUgb3RoZXIgZmllbGRzIG1pZ2h0IGJlIHVzZWQgZWxzZXdoZXJlLlxuICBjb25zdCB1c2VyID0gZ2V0VXNlckJ5SWQodXNlcklkKTtcbiAgaWYgKCF1c2VyKSB7XG4gICAgQWNjb3VudHMuX2hhbmRsZUVycm9yKFwiQ2FuJ3QgZmluZCB1c2VyXCIpO1xuICB9XG5cbiAgLy8gcGljayB0aGUgZmlyc3QgdW52ZXJpZmllZCBlbWFpbCBpZiB3ZSB3ZXJlbid0IHBhc3NlZCBhbiBlbWFpbC5cbiAgaWYgKCFlbWFpbCkge1xuICAgIGNvbnN0IGVtYWlsUmVjb3JkID0gKHVzZXIuZW1haWxzIHx8IFtdKS5maW5kKGUgPT4gIWUudmVyaWZpZWQpO1xuICAgIGVtYWlsID0gKGVtYWlsUmVjb3JkIHx8IHt9KS5hZGRyZXNzO1xuXG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgQWNjb3VudHMuX2hhbmRsZUVycm9yKFwiVGhhdCB1c2VyIGhhcyBubyB1bnZlcmlmaWVkIGVtYWlsIGFkZHJlc3Nlcy5cIik7XG4gICAgfVxuICB9XG5cbiAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYSB2YWxpZCBlbWFpbFxuICBpZiAoIWVtYWlsIHx8XG4gICAgIShwbHVja0FkZHJlc3Nlcyh1c2VyLmVtYWlscykuaW5jbHVkZXMoZW1haWwpKSkge1xuICAgIEFjY291bnRzLl9oYW5kbGVFcnJvcihcIk5vIHN1Y2ggZW1haWwgZm9yIHVzZXIuXCIpO1xuICB9XG5cbiAgY29uc3QgdG9rZW4gPSBSYW5kb20uc2VjcmV0KCk7XG4gIGNvbnN0IHRva2VuUmVjb3JkID0ge1xuICAgIHRva2VuLFxuICAgIC8vIFRPRE86IFRoaXMgc2hvdWxkIHByb2JhYmx5IGJlIHJlbmFtZWQgdG8gXCJlbWFpbFwiIHRvIG1hdGNoIHJlc2V0IHRva2VuIHJlY29yZC5cbiAgICBhZGRyZXNzOiBlbWFpbCxcbiAgICB3aGVuOiBuZXcgRGF0ZSgpXG4gIH07XG5cbiAgaWYgKGV4dHJhVG9rZW5EYXRhKSB7XG4gICAgT2JqZWN0LmFzc2lnbih0b2tlblJlY29yZCwgZXh0cmFUb2tlbkRhdGEpO1xuICB9XG5cbiAgTWV0ZW9yLnVzZXJzLnVwZGF0ZSh7X2lkOiB1c2VyLl9pZH0sIHskcHVzaDoge1xuICAgICdzZXJ2aWNlcy5lbWFpbC52ZXJpZmljYXRpb25Ub2tlbnMnOiB0b2tlblJlY29yZFxuICB9fSk7XG5cbiAgLy8gYmVmb3JlIHBhc3NpbmcgdG8gdGVtcGxhdGUsIHVwZGF0ZSB1c2VyIG9iamVjdCB3aXRoIG5ldyB0b2tlblxuICBNZXRlb3IuX2Vuc3VyZSh1c2VyLCAnc2VydmljZXMnLCAnZW1haWwnKTtcbiAgaWYgKCF1c2VyLnNlcnZpY2VzLmVtYWlsLnZlcmlmaWNhdGlvblRva2Vucykge1xuICAgIHVzZXIuc2VydmljZXMuZW1haWwudmVyaWZpY2F0aW9uVG9rZW5zID0gW107XG4gIH1cbiAgdXNlci5zZXJ2aWNlcy5lbWFpbC52ZXJpZmljYXRpb25Ub2tlbnMucHVzaCh0b2tlblJlY29yZCk7XG5cbiAgcmV0dXJuIHtlbWFpbCwgdXNlciwgdG9rZW59O1xufTtcblxuXG4vLyBzZW5kIHRoZSB1c2VyIGFuIGVtYWlsIHdpdGggYSBsaW5rIHRoYXQgd2hlbiBvcGVuZWQgYWxsb3dzIHRoZSB1c2VyXG4vLyB0byBzZXQgYSBuZXcgcGFzc3dvcmQsIHdpdGhvdXQgdGhlIG9sZCBwYXNzd29yZC5cblxuLyoqXG4gKiBAc3VtbWFyeSBTZW5kIGFuIGVtYWlsIHdpdGggYSBsaW5rIHRoZSB1c2VyIGNhbiB1c2UgdG8gcmVzZXQgdGhlaXIgcGFzc3dvcmQuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlcklkIFRoZSBpZCBvZiB0aGUgdXNlciB0byBzZW5kIGVtYWlsIHRvLlxuICogQHBhcmFtIHtTdHJpbmd9IFtlbWFpbF0gT3B0aW9uYWwuIFdoaWNoIGFkZHJlc3Mgb2YgdGhlIHVzZXIncyB0byBzZW5kIHRoZSBlbWFpbCB0by4gVGhpcyBhZGRyZXNzIG11c3QgYmUgaW4gdGhlIHVzZXIncyBgZW1haWxzYCBsaXN0LiBEZWZhdWx0cyB0byB0aGUgZmlyc3QgZW1haWwgaW4gdGhlIGxpc3QuXG4gKiBAcGFyYW0ge09iamVjdH0gW2V4dHJhVG9rZW5EYXRhXSBPcHRpb25hbCBhZGRpdGlvbmFsIGRhdGEgdG8gYmUgYWRkZWQgaW50byB0aGUgdG9rZW4gcmVjb3JkLlxuICogQHBhcmFtIHtPYmplY3R9IFtleHRyYVBhcmFtc10gT3B0aW9uYWwgYWRkaXRpb25hbCBwYXJhbXMgdG8gYmUgYWRkZWQgdG8gdGhlIHJlc2V0IHVybC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IE9iamVjdCB3aXRoIHtlbWFpbCwgdXNlciwgdG9rZW4sIHVybCwgb3B0aW9uc30gdmFsdWVzLlxuICogQGltcG9ydEZyb21QYWNrYWdlIGFjY291bnRzLWJhc2VcbiAqL1xuQWNjb3VudHMuc2VuZFJlc2V0UGFzc3dvcmRFbWFpbCA9ICh1c2VySWQsIGVtYWlsLCBleHRyYVRva2VuRGF0YSwgZXh0cmFQYXJhbXMpID0+IHtcbiAgY29uc3Qge2VtYWlsOiByZWFsRW1haWwsIHVzZXIsIHRva2VufSA9XG4gICAgQWNjb3VudHMuZ2VuZXJhdGVSZXNldFRva2VuKHVzZXJJZCwgZW1haWwsICdyZXNldFBhc3N3b3JkJywgZXh0cmFUb2tlbkRhdGEpO1xuICBjb25zdCB1cmwgPSBBY2NvdW50cy51cmxzLnJlc2V0UGFzc3dvcmQodG9rZW4sIGV4dHJhUGFyYW1zKTtcbiAgY29uc3Qgb3B0aW9ucyA9IEFjY291bnRzLmdlbmVyYXRlT3B0aW9uc0ZvckVtYWlsKHJlYWxFbWFpbCwgdXNlciwgdXJsLCAncmVzZXRQYXNzd29yZCcpO1xuICBFbWFpbC5zZW5kKG9wdGlvbnMpO1xuICBpZiAoTWV0ZW9yLmlzRGV2ZWxvcG1lbnQpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxuUmVzZXQgcGFzc3dvcmQgVVJMOiAke3VybH1gKTtcbiAgfVxuICByZXR1cm4ge2VtYWlsOiByZWFsRW1haWwsIHVzZXIsIHRva2VuLCB1cmwsIG9wdGlvbnN9O1xufTtcblxuLy8gc2VuZCB0aGUgdXNlciBhbiBlbWFpbCBpbmZvcm1pbmcgdGhlbSB0aGF0IHRoZWlyIGFjY291bnQgd2FzIGNyZWF0ZWQsIHdpdGhcbi8vIGEgbGluayB0aGF0IHdoZW4gb3BlbmVkIGJvdGggbWFya3MgdGhlaXIgZW1haWwgYXMgdmVyaWZpZWQgYW5kIGZvcmNlcyB0aGVtXG4vLyB0byBjaG9vc2UgdGhlaXIgcGFzc3dvcmQuIFRoZSBlbWFpbCBtdXN0IGJlIG9uZSBvZiB0aGUgYWRkcmVzc2VzIGluIHRoZVxuLy8gdXNlcidzIGVtYWlscyBmaWVsZCwgb3IgdW5kZWZpbmVkIHRvIHBpY2sgdGhlIGZpcnN0IGVtYWlsIGF1dG9tYXRpY2FsbHkuXG4vL1xuLy8gVGhpcyBpcyBub3QgY2FsbGVkIGF1dG9tYXRpY2FsbHkuIEl0IG11c3QgYmUgY2FsbGVkIG1hbnVhbGx5IGlmIHlvdVxuLy8gd2FudCB0byB1c2UgZW5yb2xsbWVudCBlbWFpbHMuXG5cbi8qKlxuICogQHN1bW1hcnkgU2VuZCBhbiBlbWFpbCB3aXRoIGEgbGluayB0aGUgdXNlciBjYW4gdXNlIHRvIHNldCB0aGVpciBpbml0aWFsIHBhc3N3b3JkLlxuICogQGxvY3VzIFNlcnZlclxuICogQHBhcmFtIHtTdHJpbmd9IHVzZXJJZCBUaGUgaWQgb2YgdGhlIHVzZXIgdG8gc2VuZCBlbWFpbCB0by5cbiAqIEBwYXJhbSB7U3RyaW5nfSBbZW1haWxdIE9wdGlvbmFsLiBXaGljaCBhZGRyZXNzIG9mIHRoZSB1c2VyJ3MgdG8gc2VuZCB0aGUgZW1haWwgdG8uIFRoaXMgYWRkcmVzcyBtdXN0IGJlIGluIHRoZSB1c2VyJ3MgYGVtYWlsc2AgbGlzdC4gRGVmYXVsdHMgdG8gdGhlIGZpcnN0IGVtYWlsIGluIHRoZSBsaXN0LlxuICogQHBhcmFtIHtPYmplY3R9IFtleHRyYVRva2VuRGF0YV0gT3B0aW9uYWwgYWRkaXRpb25hbCBkYXRhIHRvIGJlIGFkZGVkIGludG8gdGhlIHRva2VuIHJlY29yZC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbZXh0cmFQYXJhbXNdIE9wdGlvbmFsIGFkZGl0aW9uYWwgcGFyYW1zIHRvIGJlIGFkZGVkIHRvIHRoZSBlbnJvbGxtZW50IHVybC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IE9iamVjdCB3aXRoIHtlbWFpbCwgdXNlciwgdG9rZW4sIHVybCwgb3B0aW9uc30gdmFsdWVzLlxuICogQGltcG9ydEZyb21QYWNrYWdlIGFjY291bnRzLWJhc2VcbiAqL1xuQWNjb3VudHMuc2VuZEVucm9sbG1lbnRFbWFpbCA9ICh1c2VySWQsIGVtYWlsLCBleHRyYVRva2VuRGF0YSwgZXh0cmFQYXJhbXMpID0+IHtcbiAgY29uc3Qge2VtYWlsOiByZWFsRW1haWwsIHVzZXIsIHRva2VufSA9XG4gICAgQWNjb3VudHMuZ2VuZXJhdGVSZXNldFRva2VuKHVzZXJJZCwgZW1haWwsICdlbnJvbGxBY2NvdW50JywgZXh0cmFUb2tlbkRhdGEpO1xuICBjb25zdCB1cmwgPSBBY2NvdW50cy51cmxzLmVucm9sbEFjY291bnQodG9rZW4sIGV4dHJhUGFyYW1zKTtcbiAgY29uc3Qgb3B0aW9ucyA9IEFjY291bnRzLmdlbmVyYXRlT3B0aW9uc0ZvckVtYWlsKHJlYWxFbWFpbCwgdXNlciwgdXJsLCAnZW5yb2xsQWNjb3VudCcpO1xuICBFbWFpbC5zZW5kKG9wdGlvbnMpO1xuICBpZiAoTWV0ZW9yLmlzRGV2ZWxvcG1lbnQpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxuRW5yb2xsbWVudCBlbWFpbCBVUkw6ICR7dXJsfWApO1xuICB9XG4gIHJldHVybiB7ZW1haWw6IHJlYWxFbWFpbCwgdXNlciwgdG9rZW4sIHVybCwgb3B0aW9uc307XG59O1xuXG5cbi8vIFRha2UgdG9rZW4gZnJvbSBzZW5kUmVzZXRQYXNzd29yZEVtYWlsIG9yIHNlbmRFbnJvbGxtZW50RW1haWwsIGNoYW5nZVxuLy8gdGhlIHVzZXJzIHBhc3N3b3JkLCBhbmQgbG9nIHRoZW0gaW4uXG5NZXRlb3IubWV0aG9kcyh7cmVzZXRQYXNzd29yZDogYXN5bmMgZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgY29uc3QgdG9rZW4gPSBhcmdzWzBdO1xuICBjb25zdCBuZXdQYXNzd29yZCA9IGFyZ3NbMV07XG4gIHJldHVybiBhd2FpdCBBY2NvdW50cy5fbG9naW5NZXRob2QoXG4gICAgdGhpcyxcbiAgICBcInJlc2V0UGFzc3dvcmRcIixcbiAgICBhcmdzLFxuICAgIFwicGFzc3dvcmRcIixcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICBjaGVjayh0b2tlbiwgU3RyaW5nKTtcbiAgICAgIGNoZWNrKG5ld1Bhc3N3b3JkLCBwYXNzd29yZFZhbGlkYXRvcik7XG5cbiAgICAgIGxldCB1c2VyID0gTWV0ZW9yLnVzZXJzLmZpbmRPbmUoXG4gICAgICAgIHtcInNlcnZpY2VzLnBhc3N3b3JkLnJlc2V0LnRva2VuXCI6IHRva2VufSxcbiAgICAgICAge2ZpZWxkczoge1xuICAgICAgICAgIHNlcnZpY2VzOiAxLFxuICAgICAgICAgIGVtYWlsczogMSxcbiAgICAgICAgfX1cbiAgICAgICk7XG5cbiAgICAgIGxldCBpc0Vucm9sbCA9IGZhbHNlO1xuICAgICAgLy8gaWYgdG9rZW4gaXMgaW4gc2VydmljZXMucGFzc3dvcmQucmVzZXQgZGIgZmllbGQgaW1wbGllc1xuICAgICAgLy8gdGhpcyBtZXRob2QgaXMgd2FzIG5vdCBjYWxsZWQgZnJvbSBlbnJvbGwgYWNjb3VudCB3b3JrZmxvd1xuICAgICAgLy8gZWxzZSB0aGlzIG1ldGhvZCBpcyBjYWxsZWQgZnJvbSBlbnJvbGwgYWNjb3VudCB3b3JrZmxvd1xuICAgICAgaWYoIXVzZXIpIHtcbiAgICAgICAgdXNlciA9IE1ldGVvci51c2Vycy5maW5kT25lKFxuICAgICAgICAgIHtcInNlcnZpY2VzLnBhc3N3b3JkLmVucm9sbC50b2tlblwiOiB0b2tlbn0sXG4gICAgICAgICAge2ZpZWxkczoge1xuICAgICAgICAgICAgc2VydmljZXM6IDEsXG4gICAgICAgICAgICBlbWFpbHM6IDEsXG4gICAgICAgICAgfX1cbiAgICAgICAgKTtcbiAgICAgICAgaXNFbnJvbGwgPSB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKCF1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBcIlRva2VuIGV4cGlyZWRcIik7XG4gICAgICB9XG4gICAgICBsZXQgdG9rZW5SZWNvcmQgPSB7fTtcbiAgICAgIGlmKGlzRW5yb2xsKSB7XG4gICAgICAgIHRva2VuUmVjb3JkID0gdXNlci5zZXJ2aWNlcy5wYXNzd29yZC5lbnJvbGw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0b2tlblJlY29yZCA9IHVzZXIuc2VydmljZXMucGFzc3dvcmQucmVzZXQ7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHdoZW4sIGVtYWlsIH0gPSB0b2tlblJlY29yZDtcbiAgICAgIGxldCB0b2tlbkxpZmV0aW1lTXMgPSBBY2NvdW50cy5fZ2V0UGFzc3dvcmRSZXNldFRva2VuTGlmZXRpbWVNcygpO1xuICAgICAgaWYgKGlzRW5yb2xsKSB7XG4gICAgICAgIHRva2VuTGlmZXRpbWVNcyA9IEFjY291bnRzLl9nZXRQYXNzd29yZEVucm9sbFRva2VuTGlmZXRpbWVNcygpO1xuICAgICAgfVxuICAgICAgY29uc3QgY3VycmVudFRpbWVNcyA9IERhdGUubm93KCk7XG4gICAgICBpZiAoKGN1cnJlbnRUaW1lTXMgLSB3aGVuKSA+IHRva2VuTGlmZXRpbWVNcylcbiAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiVG9rZW4gZXhwaXJlZFwiKTtcbiAgICAgIGlmICghKHBsdWNrQWRkcmVzc2VzKHVzZXIuZW1haWxzKS5pbmNsdWRlcyhlbWFpbCkpKVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHVzZXJJZDogdXNlci5faWQsXG4gICAgICAgICAgZXJyb3I6IG5ldyBNZXRlb3IuRXJyb3IoNDAzLCBcIlRva2VuIGhhcyBpbnZhbGlkIGVtYWlsIGFkZHJlc3NcIilcbiAgICAgICAgfTtcblxuICAgICAgY29uc3QgaGFzaGVkID0gYXdhaXQgaGFzaFBhc3N3b3JkKG5ld1Bhc3N3b3JkKTtcblxuICAgICAgLy8gTk9URTogV2UncmUgYWJvdXQgdG8gaW52YWxpZGF0ZSB0b2tlbnMgb24gdGhlIHVzZXIsIHdobyB3ZSBtaWdodCBiZVxuICAgICAgLy8gbG9nZ2VkIGluIGFzLiBNYWtlIHN1cmUgdG8gYXZvaWQgbG9nZ2luZyBvdXJzZWx2ZXMgb3V0IGlmIHRoaXNcbiAgICAgIC8vIGhhcHBlbnMuIEJ1dCBhbHNvIG1ha2Ugc3VyZSBub3QgdG8gbGVhdmUgdGhlIGNvbm5lY3Rpb24gaW4gYSBzdGF0ZVxuICAgICAgLy8gb2YgaGF2aW5nIGEgYmFkIHRva2VuIHNldCBpZiB0aGluZ3MgZmFpbC5cbiAgICAgIGNvbnN0IG9sZFRva2VuID0gQWNjb3VudHMuX2dldExvZ2luVG9rZW4odGhpcy5jb25uZWN0aW9uLmlkKTtcbiAgICAgIEFjY291bnRzLl9zZXRMb2dpblRva2VuKHVzZXIuX2lkLCB0aGlzLmNvbm5lY3Rpb24sIG51bGwpO1xuICAgICAgY29uc3QgcmVzZXRUb09sZFRva2VuID0gKCkgPT5cbiAgICAgICAgQWNjb3VudHMuX3NldExvZ2luVG9rZW4odXNlci5faWQsIHRoaXMuY29ubmVjdGlvbiwgb2xkVG9rZW4pO1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBVcGRhdGUgdGhlIHVzZXIgcmVjb3JkIGJ5OlxuICAgICAgICAvLyAtIENoYW5naW5nIHRoZSBwYXNzd29yZCB0byB0aGUgbmV3IG9uZVxuICAgICAgICAvLyAtIEZvcmdldHRpbmcgYWJvdXQgdGhlIHJlc2V0IHRva2VuIG9yIGVucm9sbCB0b2tlbiB0aGF0IHdhcyBqdXN0IHVzZWRcbiAgICAgICAgLy8gLSBWZXJpZnlpbmcgdGhlaXIgZW1haWwsIHNpbmNlIHRoZXkgZ290IHRoZSBwYXNzd29yZCByZXNldCB2aWEgZW1haWwuXG4gICAgICAgIGxldCBhZmZlY3RlZFJlY29yZHMgPSB7fTtcbiAgICAgICAgLy8gaWYgcmVhc29uIGlzIGVucm9sbCB0aGVuIGNoZWNrIHNlcnZpY2VzLnBhc3N3b3JkLmVucm9sbC50b2tlbiBmaWVsZCBmb3IgYWZmZWN0ZWQgcmVjb3Jkc1xuICAgICAgICBpZihpc0Vucm9sbCkge1xuICAgICAgICAgIGFmZmVjdGVkUmVjb3JkcyA9IE1ldGVvci51c2Vycy51cGRhdGUoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIF9pZDogdXNlci5faWQsXG4gICAgICAgICAgICAgICdlbWFpbHMuYWRkcmVzcyc6IGVtYWlsLFxuICAgICAgICAgICAgICAnc2VydmljZXMucGFzc3dvcmQuZW5yb2xsLnRva2VuJzogdG9rZW5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7JHNldDogeydzZXJ2aWNlcy5wYXNzd29yZC5iY3J5cHQnOiBoYXNoZWQsXG4gICAgICAgICAgICAgICAgICAgICdlbWFpbHMuJC52ZXJpZmllZCc6IHRydWV9LFxuICAgICAgICAgICAgICAkdW5zZXQ6IHsnc2VydmljZXMucGFzc3dvcmQuZW5yb2xsJzogMSB9fSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYWZmZWN0ZWRSZWNvcmRzID0gTWV0ZW9yLnVzZXJzLnVwZGF0ZShcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgX2lkOiB1c2VyLl9pZCxcbiAgICAgICAgICAgICAgJ2VtYWlscy5hZGRyZXNzJzogZW1haWwsXG4gICAgICAgICAgICAgICdzZXJ2aWNlcy5wYXNzd29yZC5yZXNldC50b2tlbic6IHRva2VuXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyRzZXQ6IHsnc2VydmljZXMucGFzc3dvcmQuYmNyeXB0JzogaGFzaGVkLFxuICAgICAgICAgICAgICAgICAgICAnZW1haWxzLiQudmVyaWZpZWQnOiB0cnVlfSxcbiAgICAgICAgICAgICAgJHVuc2V0OiB7J3NlcnZpY2VzLnBhc3N3b3JkLnJlc2V0JzogMSB9fSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFmZmVjdGVkUmVjb3JkcyAhPT0gMSlcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdXNlcklkOiB1c2VyLl9pZCxcbiAgICAgICAgICAgIGVycm9yOiBuZXcgTWV0ZW9yLkVycm9yKDQwMywgXCJJbnZhbGlkIGVtYWlsXCIpXG4gICAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXNldFRvT2xkVG9rZW4oKTtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuXG4gICAgICAvLyBSZXBsYWNlIGFsbCB2YWxpZCBsb2dpbiB0b2tlbnMgd2l0aCBuZXcgb25lcyAoY2hhbmdpbmdcbiAgICAgIC8vIHBhc3N3b3JkIHNob3VsZCBpbnZhbGlkYXRlIGV4aXN0aW5nIHNlc3Npb25zKS5cbiAgICAgIEFjY291bnRzLl9jbGVhckFsbExvZ2luVG9rZW5zKHVzZXIuX2lkKTtcblxuICAgICAgaWYgKEFjY291bnRzLl9jaGVjazJmYUVuYWJsZWQ/Lih1c2VyKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHVzZXJJZDogdXNlci5faWQsXG4gICAgICAgICAgZXJyb3I6IEFjY291bnRzLl9oYW5kbGVFcnJvcihcbiAgICAgICAgICAgICdDaGFuZ2VkIHBhc3N3b3JkLCBidXQgdXNlciBub3QgbG9nZ2VkIGluIGJlY2F1c2UgMkZBIGlzIGVuYWJsZWQnLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICAnMmZhLWVuYWJsZWQnXG4gICAgICAgICAgKSxcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHt1c2VySWQ6IHVzZXIuX2lkfTtcbiAgICB9XG4gICk7XG59fSk7XG5cbi8vL1xuLy8vIEVNQUlMIFZFUklGSUNBVElPTlxuLy8vXG5cblxuLy8gc2VuZCB0aGUgdXNlciBhbiBlbWFpbCB3aXRoIGEgbGluayB0aGF0IHdoZW4gb3BlbmVkIG1hcmtzIHRoYXRcbi8vIGFkZHJlc3MgYXMgdmVyaWZpZWRcblxuLyoqXG4gKiBAc3VtbWFyeSBTZW5kIGFuIGVtYWlsIHdpdGggYSBsaW5rIHRoZSB1c2VyIGNhbiB1c2UgdmVyaWZ5IHRoZWlyIGVtYWlsIGFkZHJlc3MuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlcklkIFRoZSBpZCBvZiB0aGUgdXNlciB0byBzZW5kIGVtYWlsIHRvLlxuICogQHBhcmFtIHtTdHJpbmd9IFtlbWFpbF0gT3B0aW9uYWwuIFdoaWNoIGFkZHJlc3Mgb2YgdGhlIHVzZXIncyB0byBzZW5kIHRoZSBlbWFpbCB0by4gVGhpcyBhZGRyZXNzIG11c3QgYmUgaW4gdGhlIHVzZXIncyBgZW1haWxzYCBsaXN0LiBEZWZhdWx0cyB0byB0aGUgZmlyc3QgdW52ZXJpZmllZCBlbWFpbCBpbiB0aGUgbGlzdC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbZXh0cmFUb2tlbkRhdGFdIE9wdGlvbmFsIGFkZGl0aW9uYWwgZGF0YSB0byBiZSBhZGRlZCBpbnRvIHRoZSB0b2tlbiByZWNvcmQuXG4gKiBAcGFyYW0ge09iamVjdH0gW2V4dHJhUGFyYW1zXSBPcHRpb25hbCBhZGRpdGlvbmFsIHBhcmFtcyB0byBiZSBhZGRlZCB0byB0aGUgdmVyaWZpY2F0aW9uIHVybC5cbiAqXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBPYmplY3Qgd2l0aCB7ZW1haWwsIHVzZXIsIHRva2VuLCB1cmwsIG9wdGlvbnN9IHZhbHVlcy5cbiAqIEBpbXBvcnRGcm9tUGFja2FnZSBhY2NvdW50cy1iYXNlXG4gKi9cbkFjY291bnRzLnNlbmRWZXJpZmljYXRpb25FbWFpbCA9ICh1c2VySWQsIGVtYWlsLCBleHRyYVRva2VuRGF0YSwgZXh0cmFQYXJhbXMpID0+IHtcbiAgLy8gWFhYIEFsc28gZ2VuZXJhdGUgYSBsaW5rIHVzaW5nIHdoaWNoIHNvbWVvbmUgY2FuIGRlbGV0ZSB0aGlzXG4gIC8vIGFjY291bnQgaWYgdGhleSBvd24gc2FpZCBhZGRyZXNzIGJ1dCB3ZXJlbid0IHRob3NlIHdobyBjcmVhdGVkXG4gIC8vIHRoaXMgYWNjb3VudC5cblxuICBjb25zdCB7ZW1haWw6IHJlYWxFbWFpbCwgdXNlciwgdG9rZW59ID1cbiAgICBBY2NvdW50cy5nZW5lcmF0ZVZlcmlmaWNhdGlvblRva2VuKHVzZXJJZCwgZW1haWwsIGV4dHJhVG9rZW5EYXRhKTtcbiAgY29uc3QgdXJsID0gQWNjb3VudHMudXJscy52ZXJpZnlFbWFpbCh0b2tlbiwgZXh0cmFQYXJhbXMpO1xuICBjb25zdCBvcHRpb25zID0gQWNjb3VudHMuZ2VuZXJhdGVPcHRpb25zRm9yRW1haWwocmVhbEVtYWlsLCB1c2VyLCB1cmwsICd2ZXJpZnlFbWFpbCcpO1xuICBFbWFpbC5zZW5kKG9wdGlvbnMpO1xuICBpZiAoTWV0ZW9yLmlzRGV2ZWxvcG1lbnQpIHtcbiAgICBjb25zb2xlLmxvZyhgXFxuVmVyaWZpY2F0aW9uIGVtYWlsIFVSTDogJHt1cmx9YCk7XG4gIH1cbiAgcmV0dXJuIHtlbWFpbDogcmVhbEVtYWlsLCB1c2VyLCB0b2tlbiwgdXJsLCBvcHRpb25zfTtcbn07XG5cbi8vIFRha2UgdG9rZW4gZnJvbSBzZW5kVmVyaWZpY2F0aW9uRW1haWwsIG1hcmsgdGhlIGVtYWlsIGFzIHZlcmlmaWVkLFxuLy8gYW5kIGxvZyB0aGVtIGluLlxuTWV0ZW9yLm1ldGhvZHMoe3ZlcmlmeUVtYWlsOiBhc3luYyBmdW5jdGlvbiAoLi4uYXJncykge1xuICBjb25zdCB0b2tlbiA9IGFyZ3NbMF07XG4gIHJldHVybiBhd2FpdCBBY2NvdW50cy5fbG9naW5NZXRob2QoXG4gICAgdGhpcyxcbiAgICBcInZlcmlmeUVtYWlsXCIsXG4gICAgYXJncyxcbiAgICBcInBhc3N3b3JkXCIsXG4gICAgKCkgPT4ge1xuICAgICAgY2hlY2sodG9rZW4sIFN0cmluZyk7XG5cbiAgICAgIGNvbnN0IHVzZXIgPSBNZXRlb3IudXNlcnMuZmluZE9uZShcbiAgICAgICAgeydzZXJ2aWNlcy5lbWFpbC52ZXJpZmljYXRpb25Ub2tlbnMudG9rZW4nOiB0b2tlbn0sXG4gICAgICAgIHtmaWVsZHM6IHtcbiAgICAgICAgICBzZXJ2aWNlczogMSxcbiAgICAgICAgICBlbWFpbHM6IDEsXG4gICAgICAgIH19XG4gICAgICApO1xuICAgICAgaWYgKCF1c2VyKVxuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKDQwMywgXCJWZXJpZnkgZW1haWwgbGluayBleHBpcmVkXCIpO1xuXG4gICAgICAgIGNvbnN0IHRva2VuUmVjb3JkID0gdXNlci5zZXJ2aWNlcy5lbWFpbC52ZXJpZmljYXRpb25Ub2tlbnMuZmluZChcbiAgICAgICAgICB0ID0+IHQudG9rZW4gPT0gdG9rZW5cbiAgICAgICAgKTtcbiAgICAgIGlmICghdG9rZW5SZWNvcmQpXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdXNlcklkOiB1c2VyLl9pZCxcbiAgICAgICAgICBlcnJvcjogbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiVmVyaWZ5IGVtYWlsIGxpbmsgZXhwaXJlZFwiKVxuICAgICAgICB9O1xuXG4gICAgICBjb25zdCBlbWFpbHNSZWNvcmQgPSB1c2VyLmVtYWlscy5maW5kKFxuICAgICAgICBlID0+IGUuYWRkcmVzcyA9PSB0b2tlblJlY29yZC5hZGRyZXNzXG4gICAgICApO1xuICAgICAgaWYgKCFlbWFpbHNSZWNvcmQpXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdXNlcklkOiB1c2VyLl9pZCxcbiAgICAgICAgICBlcnJvcjogbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiVmVyaWZ5IGVtYWlsIGxpbmsgaXMgZm9yIHVua25vd24gYWRkcmVzc1wiKVxuICAgICAgICB9O1xuXG4gICAgICAvLyBCeSBpbmNsdWRpbmcgdGhlIGFkZHJlc3MgaW4gdGhlIHF1ZXJ5LCB3ZSBjYW4gdXNlICdlbWFpbHMuJCcgaW4gdGhlXG4gICAgICAvLyBtb2RpZmllciB0byBnZXQgYSByZWZlcmVuY2UgdG8gdGhlIHNwZWNpZmljIG9iamVjdCBpbiB0aGUgZW1haWxzXG4gICAgICAvLyBhcnJheS4gU2VlXG4gICAgICAvLyBodHRwOi8vd3d3Lm1vbmdvZGIub3JnL2Rpc3BsYXkvRE9DUy9VcGRhdGluZy8jVXBkYXRpbmctVGhlJTI0cG9zaXRpb25hbG9wZXJhdG9yKVxuICAgICAgLy8gaHR0cDovL3d3dy5tb25nb2RiLm9yZy9kaXNwbGF5L0RPQ1MvVXBkYXRpbmcjVXBkYXRpbmctJTI0cHVsbFxuICAgICAgTWV0ZW9yLnVzZXJzLnVwZGF0ZShcbiAgICAgICAge19pZDogdXNlci5faWQsXG4gICAgICAgICAnZW1haWxzLmFkZHJlc3MnOiB0b2tlblJlY29yZC5hZGRyZXNzfSxcbiAgICAgICAgeyRzZXQ6IHsnZW1haWxzLiQudmVyaWZpZWQnOiB0cnVlfSxcbiAgICAgICAgICRwdWxsOiB7J3NlcnZpY2VzLmVtYWlsLnZlcmlmaWNhdGlvblRva2Vucyc6IHthZGRyZXNzOiB0b2tlblJlY29yZC5hZGRyZXNzfX19KTtcblxuICAgICAgaWYgKEFjY291bnRzLl9jaGVjazJmYUVuYWJsZWQ/Lih1c2VyKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHVzZXJJZDogdXNlci5faWQsXG4gICAgICAgICAgZXJyb3I6IEFjY291bnRzLl9oYW5kbGVFcnJvcihcbiAgICAgICAgICAgICdFbWFpbCB2ZXJpZmllZCwgYnV0IHVzZXIgbm90IGxvZ2dlZCBpbiBiZWNhdXNlIDJGQSBpcyBlbmFibGVkJyxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgJzJmYS1lbmFibGVkJ1xuICAgICAgICAgICksXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7dXNlcklkOiB1c2VyLl9pZH07XG4gICAgfVxuICApO1xufX0pO1xuXG4vKipcbiAqIEBzdW1tYXJ5IEFkZCBhbiBlbWFpbCBhZGRyZXNzIGZvciBhIHVzZXIuIFVzZSB0aGlzIGluc3RlYWQgb2YgZGlyZWN0bHlcbiAqIHVwZGF0aW5nIHRoZSBkYXRhYmFzZS4gVGhlIG9wZXJhdGlvbiB3aWxsIGZhaWwgaWYgdGhlcmUgaXMgYSBkaWZmZXJlbnQgdXNlclxuICogd2l0aCBhbiBlbWFpbCBvbmx5IGRpZmZlcmluZyBpbiBjYXNlLiBJZiB0aGUgc3BlY2lmaWVkIHVzZXIgaGFzIGFuIGV4aXN0aW5nXG4gKiBlbWFpbCBvbmx5IGRpZmZlcmluZyBpbiBjYXNlIGhvd2V2ZXIsIHdlIHJlcGxhY2UgaXQuXG4gKiBAbG9jdXMgU2VydmVyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlcklkIFRoZSBJRCBvZiB0aGUgdXNlciB0byB1cGRhdGUuXG4gKiBAcGFyYW0ge1N0cmluZ30gbmV3RW1haWwgQSBuZXcgZW1haWwgYWRkcmVzcyBmb3IgdGhlIHVzZXIuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IFt2ZXJpZmllZF0gT3B0aW9uYWwgLSB3aGV0aGVyIHRoZSBuZXcgZW1haWwgYWRkcmVzcyBzaG91bGRcbiAqIGJlIG1hcmtlZCBhcyB2ZXJpZmllZC4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgYWNjb3VudHMtYmFzZVxuICovXG5BY2NvdW50cy5hZGRFbWFpbCA9ICh1c2VySWQsIG5ld0VtYWlsLCB2ZXJpZmllZCkgPT4ge1xuICBjaGVjayh1c2VySWQsIE5vbkVtcHR5U3RyaW5nKTtcbiAgY2hlY2sobmV3RW1haWwsIE5vbkVtcHR5U3RyaW5nKTtcbiAgY2hlY2sodmVyaWZpZWQsIE1hdGNoLk9wdGlvbmFsKEJvb2xlYW4pKTtcblxuICBpZiAodmVyaWZpZWQgPT09IHZvaWQgMCkge1xuICAgIHZlcmlmaWVkID0gZmFsc2U7XG4gIH1cblxuICBjb25zdCB1c2VyID0gZ2V0VXNlckJ5SWQodXNlcklkLCB7ZmllbGRzOiB7ZW1haWxzOiAxfX0pO1xuICBpZiAoIXVzZXIpXG4gICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiVXNlciBub3QgZm91bmRcIik7XG5cbiAgLy8gQWxsb3cgdXNlcnMgdG8gY2hhbmdlIHRoZWlyIG93biBlbWFpbCB0byBhIHZlcnNpb24gd2l0aCBhIGRpZmZlcmVudCBjYXNlXG5cbiAgLy8gV2UgZG9uJ3QgaGF2ZSB0byBjYWxsIGNoZWNrRm9yQ2FzZUluc2Vuc2l0aXZlRHVwbGljYXRlcyB0byBkbyBhIGNhc2VcbiAgLy8gaW5zZW5zaXRpdmUgY2hlY2sgYWNyb3NzIGFsbCBlbWFpbHMgaW4gdGhlIGRhdGFiYXNlIGhlcmUgYmVjYXVzZTogKDEpIGlmXG4gIC8vIHRoZXJlIGlzIG5vIGNhc2UtaW5zZW5zaXRpdmUgZHVwbGljYXRlIGJldHdlZW4gdGhpcyB1c2VyIGFuZCBvdGhlciB1c2VycyxcbiAgLy8gdGhlbiB3ZSBhcmUgT0sgYW5kICgyKSBpZiB0aGlzIHdvdWxkIGNyZWF0ZSBhIGNvbmZsaWN0IHdpdGggb3RoZXIgdXNlcnNcbiAgLy8gdGhlbiB0aGVyZSB3b3VsZCBhbHJlYWR5IGJlIGEgY2FzZS1pbnNlbnNpdGl2ZSBkdXBsaWNhdGUgYW5kIHdlIGNhbid0IGZpeFxuICAvLyB0aGF0IGluIHRoaXMgY29kZSBhbnl3YXkuXG4gIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZVJlZ0V4cCA9XG4gICAgbmV3IFJlZ0V4cChgXiR7TWV0ZW9yLl9lc2NhcGVSZWdFeHAobmV3RW1haWwpfSRgLCAnaScpO1xuXG4gIGNvbnN0IGRpZFVwZGF0ZU93bkVtYWlsID0gKHVzZXIuZW1haWxzIHx8IFtdKS5yZWR1Y2UoXG4gICAgKHByZXYsIGVtYWlsKSA9PiB7XG4gICAgICBpZiAoY2FzZUluc2Vuc2l0aXZlUmVnRXhwLnRlc3QoZW1haWwuYWRkcmVzcykpIHtcbiAgICAgICAgTWV0ZW9yLnVzZXJzLnVwZGF0ZSh7XG4gICAgICAgICAgX2lkOiB1c2VyLl9pZCxcbiAgICAgICAgICAnZW1haWxzLmFkZHJlc3MnOiBlbWFpbC5hZGRyZXNzXG4gICAgICAgIH0sIHskc2V0OiB7XG4gICAgICAgICAgJ2VtYWlscy4kLmFkZHJlc3MnOiBuZXdFbWFpbCxcbiAgICAgICAgICAnZW1haWxzLiQudmVyaWZpZWQnOiB2ZXJpZmllZFxuICAgICAgICB9fSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHByZXY7XG4gICAgICB9XG4gICAgfSxcbiAgICBmYWxzZVxuICApO1xuXG4gIC8vIEluIHRoZSBvdGhlciB1cGRhdGVzIGJlbG93LCB3ZSBoYXZlIHRvIGRvIGFub3RoZXIgY2FsbCB0b1xuICAvLyBjaGVja0ZvckNhc2VJbnNlbnNpdGl2ZUR1cGxpY2F0ZXMgdG8gbWFrZSBzdXJlIHRoYXQgbm8gY29uZmxpY3RpbmcgdmFsdWVzXG4gIC8vIHdlcmUgYWRkZWQgdG8gdGhlIGRhdGFiYXNlIGluIHRoZSBtZWFudGltZS4gV2UgZG9uJ3QgaGF2ZSB0byBkbyB0aGlzIGZvclxuICAvLyB0aGUgY2FzZSB3aGVyZSB0aGUgdXNlciBpcyB1cGRhdGluZyB0aGVpciBlbWFpbCBhZGRyZXNzIHRvIG9uZSB0aGF0IGlzIHRoZVxuICAvLyBzYW1lIGFzIGJlZm9yZSwgYnV0IG9ubHkgZGlmZmVyZW50IGJlY2F1c2Ugb2YgY2FwaXRhbGl6YXRpb24uIFJlYWQgdGhlXG4gIC8vIGJpZyBjb21tZW50IGFib3ZlIHRvIHVuZGVyc3RhbmQgd2h5LlxuXG4gIGlmIChkaWRVcGRhdGVPd25FbWFpbCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFBlcmZvcm0gYSBjYXNlIGluc2Vuc2l0aXZlIGNoZWNrIGZvciBkdXBsaWNhdGVzIGJlZm9yZSB1cGRhdGVcbiAgQWNjb3VudHMuX2NoZWNrRm9yQ2FzZUluc2Vuc2l0aXZlRHVwbGljYXRlcygnZW1haWxzLmFkZHJlc3MnLFxuICAgICdFbWFpbCcsIG5ld0VtYWlsLCB1c2VyLl9pZCk7XG5cbiAgTWV0ZW9yLnVzZXJzLnVwZGF0ZSh7XG4gICAgX2lkOiB1c2VyLl9pZFxuICB9LCB7XG4gICAgJGFkZFRvU2V0OiB7XG4gICAgICBlbWFpbHM6IHtcbiAgICAgICAgYWRkcmVzczogbmV3RW1haWwsXG4gICAgICAgIHZlcmlmaWVkOiB2ZXJpZmllZFxuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gUGVyZm9ybSBhbm90aGVyIGNoZWNrIGFmdGVyIHVwZGF0ZSwgaW4gY2FzZSBhIG1hdGNoaW5nIHVzZXIgaGFzIGJlZW5cbiAgLy8gaW5zZXJ0ZWQgaW4gdGhlIG1lYW50aW1lXG4gIHRyeSB7XG4gICAgQWNjb3VudHMuX2NoZWNrRm9yQ2FzZUluc2Vuc2l0aXZlRHVwbGljYXRlcygnZW1haWxzLmFkZHJlc3MnLFxuICAgICAgJ0VtYWlsJywgbmV3RW1haWwsIHVzZXIuX2lkKTtcbiAgfSBjYXRjaCAoZXgpIHtcbiAgICAvLyBVbmRvIHVwZGF0ZSBpZiB0aGUgY2hlY2sgZmFpbHNcbiAgICBNZXRlb3IudXNlcnMudXBkYXRlKHtfaWQ6IHVzZXIuX2lkfSxcbiAgICAgIHskcHVsbDoge2VtYWlsczoge2FkZHJlc3M6IG5ld0VtYWlsfX19KTtcbiAgICB0aHJvdyBleDtcbiAgfVxufVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlbW92ZSBhbiBlbWFpbCBhZGRyZXNzIGZvciBhIHVzZXIuIFVzZSB0aGlzIGluc3RlYWQgb2YgdXBkYXRpbmdcbiAqIHRoZSBkYXRhYmFzZSBkaXJlY3RseS5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VySWQgVGhlIElEIG9mIHRoZSB1c2VyIHRvIHVwZGF0ZS5cbiAqIEBwYXJhbSB7U3RyaW5nfSBlbWFpbCBUaGUgZW1haWwgYWRkcmVzcyB0byByZW1vdmUuXG4gKiBAaW1wb3J0RnJvbVBhY2thZ2UgYWNjb3VudHMtYmFzZVxuICovXG5BY2NvdW50cy5yZW1vdmVFbWFpbCA9ICh1c2VySWQsIGVtYWlsKSA9PiB7XG4gIGNoZWNrKHVzZXJJZCwgTm9uRW1wdHlTdHJpbmcpO1xuICBjaGVjayhlbWFpbCwgTm9uRW1wdHlTdHJpbmcpO1xuXG4gIGNvbnN0IHVzZXIgPSBnZXRVc2VyQnlJZCh1c2VySWQsIHtmaWVsZHM6IHtfaWQ6IDF9fSk7XG4gIGlmICghdXNlcilcbiAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKDQwMywgXCJVc2VyIG5vdCBmb3VuZFwiKTtcblxuICBNZXRlb3IudXNlcnMudXBkYXRlKHtfaWQ6IHVzZXIuX2lkfSxcbiAgICB7JHB1bGw6IHtlbWFpbHM6IHthZGRyZXNzOiBlbWFpbH19fSk7XG59XG5cbi8vL1xuLy8vIENSRUFUSU5HIFVTRVJTXG4vLy9cblxuLy8gU2hhcmVkIGNyZWF0ZVVzZXIgZnVuY3Rpb24gY2FsbGVkIGZyb20gdGhlIGNyZWF0ZVVzZXIgbWV0aG9kLCBib3RoXG4vLyBpZiBvcmlnaW5hdGVzIGluIGNsaWVudCBvciBzZXJ2ZXIgY29kZS4gQ2FsbHMgdXNlciBwcm92aWRlZCBob29rcyxcbi8vIGRvZXMgdGhlIGFjdHVhbCB1c2VyIGluc2VydGlvbi5cbi8vXG4vLyByZXR1cm5zIHRoZSB1c2VyIGlkXG5jb25zdCBjcmVhdGVVc2VyID0gYXN5bmMgb3B0aW9ucyA9PiB7XG4gIC8vIFVua25vd24ga2V5cyBhbGxvd2VkLCBiZWNhdXNlIGEgb25DcmVhdGVVc2VySG9vayBjYW4gdGFrZSBhcmJpdHJhcnlcbiAgLy8gb3B0aW9ucy5cbiAgY2hlY2sob3B0aW9ucywgTWF0Y2guT2JqZWN0SW5jbHVkaW5nKHtcbiAgICB1c2VybmFtZTogTWF0Y2guT3B0aW9uYWwoU3RyaW5nKSxcbiAgICBlbWFpbDogTWF0Y2guT3B0aW9uYWwoU3RyaW5nKSxcbiAgICBwYXNzd29yZDogTWF0Y2guT3B0aW9uYWwocGFzc3dvcmRWYWxpZGF0b3IpXG4gIH0pKTtcblxuICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQgfSA9IG9wdGlvbnM7XG4gIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKVxuICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoNDAwLCBcIk5lZWQgdG8gc2V0IGEgdXNlcm5hbWUgb3IgZW1haWxcIik7XG5cbiAgY29uc3QgdXNlciA9IHtzZXJ2aWNlczoge319O1xuICBpZiAocGFzc3dvcmQpIHtcbiAgICBjb25zdCBoYXNoZWQgPSBhd2FpdCBoYXNoUGFzc3dvcmQocGFzc3dvcmQpO1xuICAgIHVzZXIuc2VydmljZXMucGFzc3dvcmQgPSB7IGJjcnlwdDogaGFzaGVkIH07XG4gIH1cblxuICByZXR1cm4gQWNjb3VudHMuX2NyZWF0ZVVzZXJDaGVja2luZ0R1cGxpY2F0ZXMoeyB1c2VyLCBlbWFpbCwgdXNlcm5hbWUsIG9wdGlvbnMgfSk7XG59O1xuXG4vLyBtZXRob2QgZm9yIGNyZWF0ZSB1c2VyLiBSZXF1ZXN0cyBjb21lIGZyb20gdGhlIGNsaWVudC5cbk1ldGVvci5tZXRob2RzKHtjcmVhdGVVc2VyOiBhc3luYyBmdW5jdGlvbiAoLi4uYXJncykge1xuICBjb25zdCBvcHRpb25zID0gYXJnc1swXTtcbiAgcmV0dXJuIGF3YWl0IEFjY291bnRzLl9sb2dpbk1ldGhvZChcbiAgICB0aGlzLFxuICAgIFwiY3JlYXRlVXNlclwiLFxuICAgIGFyZ3MsXG4gICAgXCJwYXNzd29yZFwiLFxuICAgIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIGNyZWF0ZVVzZXIoKSBhYm92ZSBkb2VzIG1vcmUgY2hlY2tpbmcuXG4gICAgICBjaGVjayhvcHRpb25zLCBPYmplY3QpO1xuICAgICAgaWYgKEFjY291bnRzLl9vcHRpb25zLmZvcmJpZENsaWVudEFjY291bnRDcmVhdGlvbilcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBlcnJvcjogbmV3IE1ldGVvci5FcnJvcig0MDMsIFwiU2lnbnVwcyBmb3JiaWRkZW5cIilcbiAgICAgICAgfTtcblxuICAgICAgY29uc3QgdXNlcklkID0gYXdhaXQgQWNjb3VudHMuY3JlYXRlVXNlclZlcmlmeWluZ0VtYWlsKG9wdGlvbnMpO1xuXG4gICAgICAvLyBjbGllbnQgZ2V0cyBsb2dnZWQgaW4gYXMgdGhlIG5ldyB1c2VyIGFmdGVyd2FyZHMuXG4gICAgICByZXR1cm4ge3VzZXJJZDogdXNlcklkfTtcbiAgICB9XG4gICk7XG59fSk7XG5cbi8qKlxuICogQHN1bW1hcnkgQ3JlYXRlcyBhbiB1c2VyIGFuZCBzZW5kcyBhbiBlbWFpbCBpZiBgb3B0aW9ucy5lbWFpbGAgaXMgaW5mb3JtZWQuXG4gKiBUaGVuIGlmIHRoZSBgc2VuZFZlcmlmaWNhdGlvbkVtYWlsYCBvcHRpb24gZnJvbSB0aGUgYEFjY291bnRzYCBwYWNrYWdlIGlzXG4gKiBlbmFibGVkLCB5b3UnbGwgc2VuZCBhIHZlcmlmaWNhdGlvbiBlbWFpbCBpZiBgb3B0aW9ucy5wYXNzd29yZGAgaXMgaW5mb3JtZWQsXG4gKiBvdGhlcndpc2UgeW91J2xsIHNlbmQgYW4gZW5yb2xsbWVudCBlbWFpbC5cbiAqIEBsb2N1cyBTZXJ2ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBvcHRpb25zIG9iamVjdCB0byBiZSBwYXNzZWQgZG93biB3aGVuIGNyZWF0aW5nXG4gKiB0aGUgdXNlclxuICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMudXNlcm5hbWUgQSB1bmlxdWUgbmFtZSBmb3IgdGhpcyB1c2VyLlxuICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMuZW1haWwgVGhlIHVzZXIncyBlbWFpbCBhZGRyZXNzLlxuICogQHBhcmFtIHtTdHJpbmd9IG9wdGlvbnMucGFzc3dvcmQgVGhlIHVzZXIncyBwYXNzd29yZC4gVGhpcyBpcyBfX25vdF9fIHNlbnQgaW4gcGxhaW4gdGV4dCBvdmVyIHRoZSB3aXJlLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMucHJvZmlsZSBUaGUgdXNlcidzIHByb2ZpbGUsIHR5cGljYWxseSBpbmNsdWRpbmcgdGhlIGBuYW1lYCBmaWVsZC5cbiAqIEBpbXBvcnRGcm9tUGFja2FnZSBhY2NvdW50cy1iYXNlXG4gKiAqL1xuQWNjb3VudHMuY3JlYXRlVXNlclZlcmlmeWluZ0VtYWlsID0gYXN5bmMgKG9wdGlvbnMpID0+IHtcbiAgb3B0aW9ucyA9IHsgLi4ub3B0aW9ucyB9O1xuICAvLyBDcmVhdGUgdXNlci4gcmVzdWx0IGNvbnRhaW5zIGlkIGFuZCB0b2tlbi5cbiAgY29uc3QgdXNlcklkID0gYXdhaXQgY3JlYXRlVXNlcihvcHRpb25zKTtcbiAgLy8gc2FmZXR5IGJlbHQuIGNyZWF0ZVVzZXIgaXMgc3VwcG9zZWQgdG8gdGhyb3cgb24gZXJyb3IuIHNlbmQgNTAwIGVycm9yXG4gIC8vIGluc3RlYWQgb2Ygc2VuZGluZyBhIHZlcmlmaWNhdGlvbiBlbWFpbCB3aXRoIGVtcHR5IHVzZXJpZC5cbiAgaWYgKCEgdXNlcklkKVxuICAgIHRocm93IG5ldyBFcnJvcihcImNyZWF0ZVVzZXIgZmFpbGVkIHRvIGluc2VydCBuZXcgdXNlclwiKTtcblxuICAvLyBJZiBgQWNjb3VudHMuX29wdGlvbnMuc2VuZFZlcmlmaWNhdGlvbkVtYWlsYCBpcyBzZXQsIHJlZ2lzdGVyXG4gIC8vIGEgdG9rZW4gdG8gdmVyaWZ5IHRoZSB1c2VyJ3MgcHJpbWFyeSBlbWFpbCwgYW5kIHNlbmQgaXQgdG9cbiAgLy8gdGhhdCBhZGRyZXNzLlxuICBpZiAob3B0aW9ucy5lbWFpbCAmJiBBY2NvdW50cy5fb3B0aW9ucy5zZW5kVmVyaWZpY2F0aW9uRW1haWwpIHtcbiAgICBpZiAob3B0aW9ucy5wYXNzd29yZCkge1xuICAgICAgQWNjb3VudHMuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXJJZCwgb3B0aW9ucy5lbWFpbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIEFjY291bnRzLnNlbmRFbnJvbGxtZW50RW1haWwodXNlcklkLCBvcHRpb25zLmVtYWlsKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdXNlcklkO1xufTtcblxuLy8gQ3JlYXRlIHVzZXIgZGlyZWN0bHkgb24gdGhlIHNlcnZlci5cbi8vXG4vLyBVbmxpa2UgdGhlIGNsaWVudCB2ZXJzaW9uLCB0aGlzIGRvZXMgbm90IGxvZyB5b3UgaW4gYXMgdGhpcyB1c2VyXG4vLyBhZnRlciBjcmVhdGlvbi5cbi8vXG4vLyByZXR1cm5zIFByb21pc2U8dXNlcklkPiBvciB0aHJvd3MgYW4gZXJyb3IgaWYgaXQgY2FuJ3QgY3JlYXRlXG4vL1xuLy8gWFhYIGFkZCBhbm90aGVyIGFyZ3VtZW50IChcInNlcnZlciBvcHRpb25zXCIpIHRoYXQgZ2V0cyBzZW50IHRvIG9uQ3JlYXRlVXNlcixcbi8vIHdoaWNoIGlzIGFsd2F5cyBlbXB0eSB3aGVuIGNhbGxlZCBmcm9tIHRoZSBjcmVhdGVVc2VyIG1ldGhvZD8gZWcsIFwiYWRtaW46XG4vLyB0cnVlXCIsIHdoaWNoIHdlIHdhbnQgdG8gcHJldmVudCB0aGUgY2xpZW50IGZyb20gc2V0dGluZywgYnV0IHdoaWNoIGEgY3VzdG9tXG4vLyBtZXRob2QgY2FsbGluZyBBY2NvdW50cy5jcmVhdGVVc2VyIGNvdWxkIHNldD9cbi8vXG5cbkFjY291bnRzLmNyZWF0ZVVzZXJBc3luYyA9IGFzeW5jIChvcHRpb25zLCBjYWxsYmFjaykgPT4ge1xuICBvcHRpb25zID0geyAuLi5vcHRpb25zIH07XG5cbiAgLy8gWFhYIGFsbG93IGFuIG9wdGlvbmFsIGNhbGxiYWNrP1xuICBpZiAoY2FsbGJhY2spIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJBY2NvdW50cy5jcmVhdGVVc2VyIHdpdGggY2FsbGJhY2sgbm90IHN1cHBvcnRlZCBvbiB0aGUgc2VydmVyIHlldC5cIik7XG4gIH1cblxuICByZXR1cm4gY3JlYXRlVXNlcihvcHRpb25zKTtcbn07XG5cbi8vIENyZWF0ZSB1c2VyIGRpcmVjdGx5IG9uIHRoZSBzZXJ2ZXIuXG4vL1xuLy8gVW5saWtlIHRoZSBjbGllbnQgdmVyc2lvbiwgdGhpcyBkb2VzIG5vdCBsb2cgeW91IGluIGFzIHRoaXMgdXNlclxuLy8gYWZ0ZXIgY3JlYXRpb24uXG4vL1xuLy8gcmV0dXJucyB1c2VySWQgb3IgdGhyb3dzIGFuIGVycm9yIGlmIGl0IGNhbid0IGNyZWF0ZVxuLy9cbi8vIFhYWCBhZGQgYW5vdGhlciBhcmd1bWVudCAoXCJzZXJ2ZXIgb3B0aW9uc1wiKSB0aGF0IGdldHMgc2VudCB0byBvbkNyZWF0ZVVzZXIsXG4vLyB3aGljaCBpcyBhbHdheXMgZW1wdHkgd2hlbiBjYWxsZWQgZnJvbSB0aGUgY3JlYXRlVXNlciBtZXRob2Q/IGVnLCBcImFkbWluOlxuLy8gdHJ1ZVwiLCB3aGljaCB3ZSB3YW50IHRvIHByZXZlbnQgdGhlIGNsaWVudCBmcm9tIHNldHRpbmcsIGJ1dCB3aGljaCBhIGN1c3RvbVxuLy8gbWV0aG9kIGNhbGxpbmcgQWNjb3VudHMuY3JlYXRlVXNlciBjb3VsZCBzZXQ/XG4vL1xuXG5BY2NvdW50cy5jcmVhdGVVc2VyID0gKG9wdGlvbnMsIGNhbGxiYWNrKSA9PiB7XG4gIHJldHVybiBQcm9taXNlLmF3YWl0KEFjY291bnRzLmNyZWF0ZVVzZXJBc3luYyhvcHRpb25zLCBjYWxsYmFjaykpO1xufTtcblxuLy8vXG4vLy8gUEFTU1dPUkQtU1BFQ0lGSUMgSU5ERVhFUyBPTiBVU0VSU1xuLy8vXG5NZXRlb3IudXNlcnMuY3JlYXRlSW5kZXgoJ3NlcnZpY2VzLmVtYWlsLnZlcmlmaWNhdGlvblRva2Vucy50b2tlbicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHsgdW5pcXVlOiB0cnVlLCBzcGFyc2U6IHRydWUgfSk7XG5NZXRlb3IudXNlcnMuY3JlYXRlSW5kZXgoJ3NlcnZpY2VzLnBhc3N3b3JkLnJlc2V0LnRva2VuJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgeyB1bmlxdWU6IHRydWUsIHNwYXJzZTogdHJ1ZSB9KTtcbk1ldGVvci51c2Vycy5jcmVhdGVJbmRleCgnc2VydmljZXMucGFzc3dvcmQuZW5yb2xsLnRva2VuJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgeyB1bmlxdWU6IHRydWUsIHNwYXJzZTogdHJ1ZSB9KTtcbiJdfQ==
