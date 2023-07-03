var require = meteorInstall({"imports":{"api":{"checks":{"checkUserRoles.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/checks/checkUserRoles.js                                                                           //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
module.export({
  checkUserRole: () => checkUserRole
});
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
function checkUserRole(allowedRoles, user) {
  const currentUser = user ? user : Meteor.user();
  if (!currentUser) {
    throw new Meteor.Error('User not found');
  }
  if (!allowedRoles.includes(currentUser.profile.role)) {
    return false;
  }
  return true;
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"collection":{"ContactsCollection.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/collection/ContactsCollection.js                                                                   //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
module.export({
  ContactsCollection: () => ContactsCollection
});
let Mongo;
module.link("meteor/mongo", {
  Mongo(v) {
    Mongo = v;
  }
}, 0);
const ContactsCollection = new Mongo.Collection('contacts');
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"OrganizationsCollection.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/collection/OrganizationsCollection.js                                                              //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
module.export({
  OrganizationsCollection: () => OrganizationsCollection
});
let Mongo;
module.link("meteor/mongo", {
  Mongo(v) {
    Mongo = v;
  }
}, 0);
const OrganizationsCollection = new Mongo.Collection('organizations');
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"TagsCollection.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/collection/TagsCollection.js                                                                       //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
module.export({
  TagsCollection: () => TagsCollection
});
let Mongo;
module.link("meteor/mongo", {
  Mongo(v) {
    Mongo = v;
  }
}, 0);
const TagsCollection = new Mongo.Collection('tags');
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"decleration":{"permission.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/decleration/permission.js                                                                          //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
module.export({
  permission: () => permission
});
let roles;
module.link("./roles", {
  roles(v) {
    roles = v;
  }
}, 0);
const permission = {
  CREATE_ORGANIZATION: [roles.keelaAdmin],
  REMOVE_ORGANIZATION: [roles.keelaAdmin],
  EDIT_ORGANIZATION: [roles.keelaAdmin],
  VIEW_ORGANIZATION: [roles.keelaAdmin],
  CREATE_USER: [roles.keelaAdmin, roles.admin],
  REMOVE_USER: [roles.admin],
  EDIT_USER: [roles.admin],
  VIEW_USER: [roles.keelaAdmin, roles.admin],
  CREATE_TAG: [roles.admin, roles.coordinator],
  REMOVE_TAG: [roles.admin, roles.coordinator],
  EDIT_TAG: [roles.admin, roles.coordinator],
  VIEW_TAG: [roles.admin, roles.coordinator],
  CREATE_CONTACT: [roles.admin],
  REMOVE_CONTACT: [roles.admin],
  EDIT_CONTACT: [roles.admin],
  VIEW_CONTACT: [roles.admin, roles.coordinator]
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"roles.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/decleration/roles.js                                                                               //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
module.export({
  roles: () => roles
});
const roles = {
  keelaAdmin: 'keelaAdmin',
  admin: 'admin',
  coordinator: 'coordinator'
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"methods":{"ContactMethods.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/methods/ContactMethods.js                                                                          //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
let check;
module.link("meteor/check", {
  check(v) {
    check = v;
  }
}, 0);
let ContactsCollection;
module.link("../collection/ContactsCollection", {
  ContactsCollection(v) {
    ContactsCollection = v;
  }
}, 1);
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 2);
let permission;
module.link("../decleration/permission", {
  permission(v) {
    permission = v;
  }
}, 3);
let checkUserRole;
module.link("../checks/checkUserRoles", {
  checkUserRole(v) {
    checkUserRole = v;
  }
}, 4);
Meteor.methods({
  'contacts.create'(contactDetails) {
    const currentUser = Meteor.user();
    check(contactDetails, Object);
    if (!contactDetails) {
      throw new Meteor.Error('No contact found.');
    }
    if (checkUserRole(permission.CREATE_CONTACT)) {
      if (currentUser) ContactsCollection.insert(_objectSpread(_objectSpread({}, contactDetails), {}, {
        createdAt: new Date()
      }));
    } else {
      throw new Meteor.Error('Operation Not Authorized');
    }
  },
  'contacts.remove'(contactId) {
    check(contactId, String);
    const contact = ContactsCollection.findOne({
      _id: contactId
    });
    if (!contact) {
      Meteor.Error("Contact doesn't exist");
    }
    if (checkUserRole(permission.REMOVE_CONTACT)) {
      ContactsCollection.remove(contactId);
    } else {
      return Meteor.Error('Operation Not Authorized');
    }
  },
  'contacts.edit'(contact) {
    const {
      _id,
      name,
      email,
      phone,
      tags
    } = contact;
    if (checkUserRole(permission.EDIT_CONTACT)) {
      ContactsCollection.update(_id, {
        $set: {
          name: name,
          email: email,
          phone: phone,
          tags: tags,
          modifiedBy: this.userId,
          modifiedAt: new Date()
        }
      });
    } else {
      throw new Meteor.Error('Operation Not authorized.');
    }
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"OrganizationMethods.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/methods/OrganizationMethods.js                                                                     //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
let check;
module.link("meteor/check", {
  check(v) {
    check = v;
  }
}, 0);
let OrganizationsCollection;
module.link("../collection/OrganizationsCollection", {
  OrganizationsCollection(v) {
    OrganizationsCollection = v;
  }
}, 1);
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 2);
let permission;
module.link("../decleration/permission", {
  permission(v) {
    permission = v;
  }
}, 3);
let checkUserRole;
module.link("../checks/checkUserRoles", {
  checkUserRole(v) {
    checkUserRole = v;
  }
}, 4);
Meteor.methods({
  'organizations.create'(organizationDetails) {
    const currentUser = Meteor.user();
    check(organizationDetails, Object);
    if (!organizationDetails) {
      throw new Meteor.Error('No organization found.');
    }
    if (checkUserRole(permission.CREATE_ORGANIZATION)) {
      if (currentUser) OrganizationsCollection.insert(_objectSpread(_objectSpread({}, organizationDetails), {}, {
        createdAt: new Date()
      }));
    } else {
      throw new Meteor.Error('Operation Not Authorized');
    }
  },
  'organizations.remove'(organizationId) {
    check(organizationId, String);
    const organization = OrganizationsCollection.findOne({
      _id: organizationId
    });
    if (!organization) {
      Meteor.Error("Organization doesn't exist");
    }
    if (checkUserRole(permission.REMOVE_ORGANIZATION)) {
      OrganizationsCollection.remove(organizationId);
    } else {
      return Meteor.Error('Operation Not Authorized');
    }
  },
  'organizations.edit'(organization) {
    if (checkUserRole(permission.EDIT_ORGANIZATION)) {
      OrganizationsCollection.update(organization._id, {
        $set: _objectSpread(_objectSpread({}, organization), {}, {
          modifiedBy: this.userId,
          modifiedAt: new Date()
        })
      });
    } else {
      throw new Meteor.Error('Operation Not authorized.');
    }
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"TagsMethods.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/methods/TagsMethods.js                                                                             //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
let TagsCollection;
module.link("../collection/TagsCollection", {
  TagsCollection(v) {
    TagsCollection = v;
  }
}, 0);
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 1);
let check;
module.link("meteor/check", {
  check(v) {
    check = v;
  }
}, 2);
let permission;
module.link("../decleration/permission", {
  permission(v) {
    permission = v;
  }
}, 3);
let checkUserRole;
module.link("../checks/checkUserRoles", {
  checkUserRole(v) {
    checkUserRole = v;
  }
}, 4);
Meteor.methods({
  'tags.create'(tagsDetails) {
    const currentUser = Meteor.user();
    check(tagsDetails, Object);
    if (!tagsDetails) {
      throw new Meteor.Error('No tags found.');
    }
    if (checkUserRole(permission.CREATE_TAG)) {
      if (currentUser) TagsCollection.insert(_objectSpread(_objectSpread({}, tagsDetails), {}, {
        createdAt: new Date(),
        userId: this.userId,
        organizationId: currentUser.profile.organizationId
      }));
    } else {
      throw new Meteor.Error('Operation Not authorized.');
    }
  },
  'tags.remove'(tagId) {
    check(tagId, String);
    const tag = TagsCollection.findOne({
      _id: tagId
    });
    if (!tag) {
      Meteor.Error("Organization doesn't exist");
    }
    if (checkUserRole(permission.REMOVE_TAG)) {
      TagsCollection.remove(tagId);
    } else {
      return Meteor.Error('Operation Not Authorized');
    }
  },
  'tags.edit'(tag) {
    const {
      _id,
      name
    } = tag;
    if (checkUserRole(permission.EDIT_TAG)) {
      TagsCollection.update(_id, {
        $set: {
          name: name,
          modifiedBy: this.userId,
          modifiedAt: new Date()
        }
      });
    } else {
      throw new Meteor.Error('Operation Not authorized.');
    }
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"UserMethods.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/methods/UserMethods.js                                                                             //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
let Accounts;
module.link("meteor/accounts-base", {
  Accounts(v) {
    Accounts = v;
  }
}, 0);
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 1);
let check;
module.link("meteor/check", {
  check(v) {
    check = v;
  }
}, 2);
let permission;
module.link("../decleration/permission", {
  permission(v) {
    permission = v;
  }
}, 3);
let checkUserRole;
module.link("../checks/checkUserRoles", {
  checkUserRole(v) {
    checkUserRole = v;
  }
}, 4);
Meteor.methods({
  'users.create'(userDetails) {
    if (checkUserRole(permission.CREATE_USER)) {
      if (!Accounts.findUserByUsername(userDetails.username)) {
        Accounts.createUser(userDetails);
      }
    } else {
      throw new Meteor.Error('Operation Not authorized.');
    }
    if (!Accounts.findUserByUsername(userDetails.username)) {
      Accounts.createUser(userDetails);
    }
  },
  'users.remove'(userId) {
    check(userId, String);
    if (checkUserRole(permission.REMOVE_USER)) {
      if (!this.userId) {
        throw new Meteor.Error('Operation not authorized.');
      }
      if (this.userId === userId) {
        throw new Meteor.Error('Cannot delete myself');
      }
      Meteor.users.remove(userId);
    } else {
      throw new Meteor.Error('Operation not authorized.');
    }
    Meteor.users.remove({
      _id: userId,
      'profile.role': {
        $ne: 'keelaAdmin'
      }
    });
  },
  'users.update'(user) {
    if (checkUserRole(permission.EDIT_USER)) {
      Meteor.users.update({
        _id: user.userId
      }, {
        $set: {
          username: user.updates.username,
          'profile.role': user.updates['profile.role'],
          'profile.organizationId': user.updates['profile.organizationId'],
          'profile.organizationName': user.updates['profile.organizationName']
        }
      });
    } else {
      throw new Meteor.Error('Operation not authorized.');
    }
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}},"publications":{"ContactPublication.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/publications/ContactPublication.js                                                                 //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
let ContactsCollection;
module.link("../collection/ContactsCollection", {
  ContactsCollection(v) {
    ContactsCollection = v;
  }
}, 1);
Meteor.publish('contacts', function publishContacts() {
  const currentUser = Meteor.user();
  if (currentUser && currentUser.profile && currentUser.profile.organizationId) {
    return ContactsCollection.find({
      organizationId: currentUser.profile.organizationId
    });
  }
  return;
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"OrganizationPublication.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/publications/OrganizationPublication.js                                                            //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
let OrganizationsCollection;
module.link("../collection/OrganizationsCollection", {
  OrganizationsCollection(v) {
    OrganizationsCollection = v;
  }
}, 1);
Meteor.publish('organizations', function publishOrganizations() {
  return OrganizationsCollection.find({});
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"TagsPublication.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/publications/TagsPublication.js                                                                    //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
let TagsCollection;
module.link("../collection/TagsCollection", {
  TagsCollection(v) {
    TagsCollection = v;
  }
}, 1);
Meteor.publish('tags', function publishTags() {
  const currentUser = Meteor.user();
  if (currentUser && currentUser.profile && currentUser.profile.organizationId) {
    return TagsCollection.find({
      organizationId: currentUser.profile.organizationId
    });
  }
  return;
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

},"UserPublication.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// imports/api/publications/UserPublication.js                                                                    //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
Meteor.publish('users', function publishUser() {
  return Meteor.users.find({});
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}}},"server":{"main.js":function module(require,exports,module){

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                                //
// server/main.js                                                                                                 //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                                  //
let _objectSpread;
module.link("@babel/runtime/helpers/objectSpread2", {
  default(v) {
    _objectSpread = v;
  }
}, 0);
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
let Accounts;
module.link("meteor/accounts-base", {
  Accounts(v) {
    Accounts = v;
  }
}, 1);
let OrganizationsCollection;
module.link("../imports/api/collection/OrganizationsCollection", {
  OrganizationsCollection(v) {
    OrganizationsCollection = v;
  }
}, 2);
let TagsCollection;
module.link("../imports/api/collection/TagsCollection", {
  TagsCollection(v) {
    TagsCollection = v;
  }
}, 3);
let ContactsCollection;
module.link("../imports/api/collection/ContactsCollection", {
  ContactsCollection(v) {
    ContactsCollection = v;
  }
}, 4);
module.link("../imports/api/methods/TagsMethods");
module.link("../imports/api/methods/UserMethods");
module.link("../imports/api/methods/OrganizationMethods");
module.link("../imports/api/methods/ContactMethods");
module.link("../imports/api/publications/OrganizationPublication");
module.link("../imports/api/publications/UserPublication");
module.link("../imports/api/publications/TagsPublication");
module.link("../imports/api/publications/ContactPublication");
let roles;
module.link("../imports/api/decleration/roles", {
  roles(v) {
    roles = v;
  }
}, 5);
const KEELA_ADMIN_USERNAME = 'keelaAdmin';
const ADMIN_USERNAME = 'admin';
const COORDINATOR_USERNAME = 'coordinator';
const PASSWORD = 'password';
const insertOrgnization = organization => {
  OrganizationsCollection.insert(_objectSpread({}, organization));
};
Meteor.startup(() => Promise.asyncApply(() => {
  if (OrganizationsCollection.find().count() === 0) {
    [{
      name: 'myOrganization',
      email: 'myorgqanization@keela.com',
      address: 'myAddress',
      phone: '9898989898',
      createdAt: new Date()
    }].forEach(insertOrgnization);
  }
  const myOrganizationId = OrganizationsCollection.findOne({
    name: 'myOrganization'
  });
  if (!Accounts.findUserByUsername(KEELA_ADMIN_USERNAME)) {
    Accounts.createUser({
      username: KEELA_ADMIN_USERNAME,
      password: PASSWORD,
      profile: {
        role: roles.keelaAdmin,
        organizationId: myOrganizationId._id,
        organizationName: 'myOrganization'
      }
    });
  }
  if (!Accounts.findUserByUsername(ADMIN_USERNAME)) {
    Accounts.createUser({
      username: ADMIN_USERNAME,
      password: PASSWORD,
      profile: {
        role: roles.admin,
        organizationId: myOrganizationId._id,
        organizationName: 'myOrganization'
      }
    });
  }
  if (!Accounts.findUserByUsername(COORDINATOR_USERNAME)) {
    Accounts.createUser({
      username: COORDINATOR_USERNAME,
      password: PASSWORD,
      profile: {
        role: roles.coordinator,
        organizationId: myOrganizationId._id,
        organizationName: 'myOrganization'
      }
    });
  }
}));
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}}},{
  "extensions": [
    ".js",
    ".json",
    ".ts",
    ".mjs"
  ]
});

var exports = require("/server/main.js");
//# sourceURL=meteor://💻app/app/app.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvY2hlY2tzL2NoZWNrVXNlclJvbGVzLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9pbXBvcnRzL2FwaS9jb2xsZWN0aW9uL0NvbnRhY3RzQ29sbGVjdGlvbi5qcyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvY29sbGVjdGlvbi9Pcmdhbml6YXRpb25zQ29sbGVjdGlvbi5qcyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvY29sbGVjdGlvbi9UYWdzQ29sbGVjdGlvbi5qcyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvZGVjbGVyYXRpb24vcGVybWlzc2lvbi5qcyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvZGVjbGVyYXRpb24vcm9sZXMuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21ldGhvZHMvQ29udGFjdE1ldGhvZHMuanMiLCJtZXRlb3I6Ly/wn5K7YXBwL2ltcG9ydHMvYXBpL21ldGhvZHMvT3JnYW5pemF0aW9uTWV0aG9kcy5qcyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWV0aG9kcy9UYWdzTWV0aG9kcy5qcyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvbWV0aG9kcy9Vc2VyTWV0aG9kcy5qcyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvcHVibGljYXRpb25zL0NvbnRhY3RQdWJsaWNhdGlvbi5qcyIsIm1ldGVvcjovL/CfkrthcHAvaW1wb3J0cy9hcGkvcHVibGljYXRpb25zL09yZ2FuaXphdGlvblB1YmxpY2F0aW9uLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9pbXBvcnRzL2FwaS9wdWJsaWNhdGlvbnMvVGFnc1B1YmxpY2F0aW9uLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9pbXBvcnRzL2FwaS9wdWJsaWNhdGlvbnMvVXNlclB1YmxpY2F0aW9uLmpzIiwibWV0ZW9yOi8v8J+Su2FwcC9zZXJ2ZXIvbWFpbi5qcyJdLCJuYW1lcyI6WyJtb2R1bGUiLCJleHBvcnQiLCJjaGVja1VzZXJSb2xlIiwiTWV0ZW9yIiwibGluayIsInYiLCJhbGxvd2VkUm9sZXMiLCJ1c2VyIiwiY3VycmVudFVzZXIiLCJFcnJvciIsImluY2x1ZGVzIiwicHJvZmlsZSIsInJvbGUiLCJDb250YWN0c0NvbGxlY3Rpb24iLCJNb25nbyIsIkNvbGxlY3Rpb24iLCJPcmdhbml6YXRpb25zQ29sbGVjdGlvbiIsIlRhZ3NDb2xsZWN0aW9uIiwicGVybWlzc2lvbiIsInJvbGVzIiwiQ1JFQVRFX09SR0FOSVpBVElPTiIsImtlZWxhQWRtaW4iLCJSRU1PVkVfT1JHQU5JWkFUSU9OIiwiRURJVF9PUkdBTklaQVRJT04iLCJWSUVXX09SR0FOSVpBVElPTiIsIkNSRUFURV9VU0VSIiwiYWRtaW4iLCJSRU1PVkVfVVNFUiIsIkVESVRfVVNFUiIsIlZJRVdfVVNFUiIsIkNSRUFURV9UQUciLCJjb29yZGluYXRvciIsIlJFTU9WRV9UQUciLCJFRElUX1RBRyIsIlZJRVdfVEFHIiwiQ1JFQVRFX0NPTlRBQ1QiLCJSRU1PVkVfQ09OVEFDVCIsIkVESVRfQ09OVEFDVCIsIlZJRVdfQ09OVEFDVCIsIl9vYmplY3RTcHJlYWQiLCJkZWZhdWx0IiwiY2hlY2siLCJtZXRob2RzIiwiY29udGFjdERldGFpbHMiLCJPYmplY3QiLCJpbnNlcnQiLCJjcmVhdGVkQXQiLCJEYXRlIiwiY29udGFjdElkIiwiU3RyaW5nIiwiY29udGFjdCIsImZpbmRPbmUiLCJfaWQiLCJyZW1vdmUiLCJuYW1lIiwiZW1haWwiLCJwaG9uZSIsInRhZ3MiLCJ1cGRhdGUiLCIkc2V0IiwibW9kaWZpZWRCeSIsInVzZXJJZCIsIm1vZGlmaWVkQXQiLCJvcmdhbml6YXRpb25EZXRhaWxzIiwib3JnYW5pemF0aW9uSWQiLCJvcmdhbml6YXRpb24iLCJ0YWdzRGV0YWlscyIsInRhZ0lkIiwidGFnIiwiQWNjb3VudHMiLCJ1c2VyRGV0YWlscyIsImZpbmRVc2VyQnlVc2VybmFtZSIsInVzZXJuYW1lIiwiY3JlYXRlVXNlciIsInVzZXJzIiwiJG5lIiwidXBkYXRlcyIsInB1Ymxpc2giLCJwdWJsaXNoQ29udGFjdHMiLCJmaW5kIiwicHVibGlzaE9yZ2FuaXphdGlvbnMiLCJwdWJsaXNoVGFncyIsInB1Ymxpc2hVc2VyIiwiS0VFTEFfQURNSU5fVVNFUk5BTUUiLCJBRE1JTl9VU0VSTkFNRSIsIkNPT1JESU5BVE9SX1VTRVJOQU1FIiwiUEFTU1dPUkQiLCJpbnNlcnRPcmduaXphdGlvbiIsInN0YXJ0dXAiLCJjb3VudCIsImFkZHJlc3MiLCJmb3JFYWNoIiwibXlPcmdhbml6YXRpb25JZCIsInBhc3N3b3JkIiwib3JnYW5pemF0aW9uTmFtZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFBQUEsTUFBTSxDQUFDQyxNQUFNLENBQUM7RUFBQ0MsYUFBYSxFQUFDLE1BQUlBO0FBQWEsQ0FBQyxDQUFDO0FBQUMsSUFBSUMsTUFBTTtBQUFDSCxNQUFNLENBQUNJLElBQUksQ0FBQyxlQUFlLEVBQUM7RUFBQ0QsTUFBTSxDQUFDRSxDQUFDLEVBQUM7SUFBQ0YsTUFBTSxHQUFDRSxDQUFDO0VBQUE7QUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0FBRWhILFNBQVNILGFBQWEsQ0FBQ0ksWUFBWSxFQUFFQyxJQUFJLEVBQUU7RUFDdkMsTUFBTUMsV0FBVyxHQUFHRCxJQUFJLEdBQUdBLElBQUksR0FBR0osTUFBTSxDQUFDSSxJQUFJLEVBQUU7RUFDL0MsSUFBSSxDQUFDQyxXQUFXLEVBQUU7SUFDZCxNQUFNLElBQUlMLE1BQU0sQ0FBQ00sS0FBSyxDQUFDLGdCQUFnQixDQUFDO0VBQzVDO0VBQ0EsSUFBSSxDQUFDSCxZQUFZLENBQUNJLFFBQVEsQ0FBQ0YsV0FBVyxDQUFDRyxPQUFPLENBQUNDLElBQUksQ0FBQyxFQUFFO0lBQ2xELE9BQU8sS0FBSztFQUNoQjtFQUNBLE9BQU8sSUFBSTtBQUNmLEM7Ozs7Ozs7Ozs7O0FDWEFaLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDO0VBQUNZLGtCQUFrQixFQUFDLE1BQUlBO0FB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YyxFQUFFNEIsZ0JBQWdCLENBQUN4QyxHQUFHO1FBQ3BDMEMsZ0JBQWdCLEVBQUU7TUFDdEI7SUFDSixDQUFDLENBQUM7RUFDTjtFQUVBLElBQUksQ0FBQ3pCLFFBQVEsQ0FBQ0Usa0JBQWtCLENBQUNhLGNBQWMsQ0FBQyxFQUFFO0lBQzlDZixRQUFRLENBQUNJLFVBQVUsQ0FBQztNQUNoQkQsUUFBUSxFQUFFWSxjQUFjO01BQ3hCUyxRQUFRLEVBQUVQLFFBQVE7TUFDbEIzRSxPQUFPLEVBQUU7UUFDTEMsSUFBSSxFQUFFTyxLQUFLLENBQUNPLEtBQUs7UUFDakJzQyxjQUFjLEVBQUU0QixnQkFBZ0IsQ0FBQ3hDLEdBQUc7UUFDcEMwQyxnQkFBZ0IsRUFBRTtNQUN0QjtJQUNKLENBQUMsQ0FBQztFQUNOO0VBRUEsSUFBSSxDQUFDekIsUUFBUSxDQUFDRSxrQkFBa0IsQ0FBQ2Msb0JBQW9CLENBQUMsRUFBRTtJQUNwRGhCLFFBQVEsQ0FBQ0ksVUFBVSxDQUFDO01BQ2hCRCxRQUFRLEVBQUVhLG9CQUFvQjtNQUM5QlEsUUFBUSxFQUFFUCxRQUFRO01BQ2xCM0UsT0FBTyxFQUFFO1FBQ0xDLElBQUksRUFBRU8sS0FBSyxDQUFDWSxXQUFXO1FBQ3ZCaUMsY0FBYyxFQUFFNEIsZ0JBQWdCLENBQUN4QyxHQUFHO1FBQ3BDMEMsZ0JBQWdCLEVBQUU7TUFDdEI7SUFDSixDQUFDLENBQUM7RUFDTjtBQUNKLENBQUMsRUFBQyxDIiwiZmlsZSI6Ii9hcHAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcclxuXHJcbmZ1bmN0aW9uIGNoZWNrVXNlclJvbGUoYWxsb3dlZFJvbGVzLCB1c2VyKSB7XHJcbiAgICBjb25zdCBjdXJyZW50VXNlciA9IHVzZXIgPyB1c2VyIDogTWV0ZW9yLnVzZXIoKTtcclxuICAgIGlmICghY3VycmVudFVzZXIpIHtcclxuICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdVc2VyIG5vdCBmb3VuZCcpO1xyXG4gICAgfVxyXG4gICAgaWYgKCFhbGxvd2VkUm9sZXMuaW5jbHVkZXMoY3VycmVudFVzZXIucHJvZmlsZS5yb2xlKSkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlO1xyXG59XHJcblxyXG5leHBvcnQgeyBjaGVja1VzZXJSb2xlIH07XHJcbiIsImltcG9ydCB7IE1vbmdvIH0gZnJvbSAnbWV0ZW9yL21vbmdvJztcblxuZXhwb3J0IGNvbnN0IENvbnRhY3RzQ29sbGVjdGlvbiA9IG5ldyBNb25nby5Db2xsZWN0aW9uKCdjb250YWN0cycpO1xuIiwiaW1wb3J0IHsgTW9uZ28gfSBmcm9tICdtZXRlb3IvbW9uZ28nO1xuXG5leHBvcnQgY29uc3QgT3JnYW5pemF0aW9uc0NvbGxlY3Rpb24gPSBuZXcgTW9uZ28uQ29sbGVjdGlvbignb3JnYW5pemF0aW9ucycpO1xuIiwiaW1wb3J0IHsgTW9uZ28gfSBmcm9tICdtZXRlb3IvbW9uZ28nO1xyXG5cclxuZXhwb3J0IGNvbnN0IFRhZ3NDb2xsZWN0aW9uID0gbmV3IE1vbmdvLkNvbGxlY3Rpb24oJ3RhZ3MnKTtcclxuIiwiaW1wb3J0IHsgcm9sZXMgfSBmcm9tICcuL3JvbGVzJztcclxuZXhwb3J0IGNvbnN0IHBlcm1pc3Npb24gPSB7XHJcbiAgICBDUkVBVEVfT1JHQU5JWkFUSU9OOiBbcm9sZXMua2VlbGFBZG1pbl0sXHJcbiAgICBSRU1PVkVfT1JHQU5JWkFUSU9OOiBbcm9sZXMua2VlbGFBZG1pbl0sXHJcbiAgICBFRElUX09SR0FOSVpBVElPTjogW3JvbGVzLmtlZWxhQWRtaW5dLFxyXG4gICAgVklFV19PUkdBTklaQVRJT046IFtyb2xlcy5rZWVsYUFkbWluXSxcclxuXHJcbiAgICBDUkVBVEVfVVNFUjogW3JvbGVzLmtlZWxhQWRtaW4sIHJvbGVzLmFkbWluXSxcclxuICAgIFJFTU9WRV9VU0VSOiBbcm9sZXMuYWRtaW5dLFxyXG4gICAgRURJVF9VU0VSOiBbcm9sZXMuYWRtaW5dLFxyXG4gICAgVklFV19VU0VSOiBbcm9sZXMua2VlbGFBZG1pbiwgcm9sZXMuYWRtaW5dLFxyXG5cclxuICAgIENSRUFURV9UQUc6IFtyb2xlcy5hZG1pbiwgcm9sZXMuY29vcmRpbmF0b3JdLFxyXG4gICAgUkVNT1ZFX1RBRzogW3JvbGVzLmFkbWluLCByb2xlcy5jb29yZGluYXRvcl0sXHJcbiAgICBFRElUX1RBRzogW3JvbGVzLmFkbWluLCByb2xlcy5jb29yZGluYXRvcl0sXHJcbiAgICBWSUVXX1RBRzogW3JvbGVzLmFkbWluLCByb2xlcy5jb29yZGluYXRvcl0sXHJcblxyXG4gICAgQ1JFQVRFX0NPTlRBQ1Q6IFtyb2xlcy5hZG1pbl0sXHJcbiAgICBSRU1PVkVfQ09OVEFDVDogW3JvbGVzLmFkbWluXSxcclxuICAgIEVESVRfQ09OVEFDVDogW3JvbGVzLmFkbWluXSxcclxuICAgIFZJRVdfQ09OVEFDVDogW3JvbGVzLmFkbWluLCByb2xlcy5jb29yZGluYXRvcl0sXHJcbn07XHJcbiIsImNvbnN0IHJvbGVzID0ge1xyXG4gICAga2VlbGFBZG1pbjogJ2tlZWxhQWRtaW4nLFxyXG4gICAgYWRtaW46ICdhZG1pbicsXHJcbiAgICBjb29yZGluYXRvcjogJ2Nvb3JkaW5hdG9yJyxcclxufTtcclxuZXhwb3J0IHsgcm9sZXMgfTtcclxuIiwiaW1wb3J0IHsgY2hlY2sgfSBmcm9tICdtZXRlb3IvY2hlY2snO1xyXG5pbXBvcnQgeyBDb250YWN0c0NvbGxlY3Rpb24gfSBmcm9tICcuLi9jb2xsZWN0aW9uL0NvbnRhY3RzQ29sbGVjdGlvbic7XHJcbmltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xyXG5pbXBvcnQgeyBwZXJtaXNzaW9uIH0gZnJvbSAnLi4vZGVjbGVyYXRpb24vcGVybWlzc2lvbic7XHJcbmltcG9ydCB7IGNoZWNrVXNlclJvbGUgfSBmcm9tICcuLi9jaGVja3MvY2hlY2tVc2VyUm9sZXMnO1xyXG5cclxuTWV0ZW9yLm1ldGhvZHMoe1xyXG4gICAgJ2NvbnRhY3RzLmNyZWF0ZScoY29udGFjdERldGFpbHMpIHtcclxuICAgICAgICBjb25zdCBjdXJyZW50VXNlciA9IE1ldGVvci51c2VyKCk7XHJcbiAgICAgICAgY2hlY2soY29udGFjdERldGFpbHMsIE9iamVjdCk7XHJcbiAgICAgICAgaWYgKCFjb250YWN0RGV0YWlscykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdObyBjb250YWN0IGZvdW5kLicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlY2tVc2VyUm9sZShwZXJtaXNzaW9uLkNSRUFURV9DT05UQUNUKSkge1xyXG4gICAgICAgICAgICBpZiAoY3VycmVudFVzZXIpXHJcbiAgICAgICAgICAgICAgICBDb250YWN0c0NvbGxlY3Rpb24uaW5zZXJ0KHtcclxuICAgICAgICAgICAgICAgICAgICAuLi5jb250YWN0RGV0YWlscyxcclxuICAgICAgICAgICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdPcGVyYXRpb24gTm90IEF1dGhvcml6ZWQnKTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG5cclxuICAgICdjb250YWN0cy5yZW1vdmUnKGNvbnRhY3RJZCkge1xyXG4gICAgICAgIGNoZWNrKGNvbnRhY3RJZCwgU3RyaW5nKTtcclxuICAgICAgICBjb25zdCBjb250YWN0ID0gQ29udGFjdHNDb2xsZWN0aW9uLmZpbmRPbmUoe1xyXG4gICAgICAgICAgICBfaWQ6IGNvbnRhY3RJZCxcclxuICAgICAgICB9KTtcclxuICAgICAgICBpZiAoIWNvbnRhY3QpIHtcclxuICAgICAgICAgICAgTWV0ZW9yLkVycm9yKFwiQ29udGFjdCBkb2Vzbid0IGV4aXN0XCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlY2tVc2VyUm9sZShwZXJtaXNzaW9uLlJFTU9WRV9DT05UQUNUKSkge1xyXG4gICAgICAgICAgICBDb250YWN0c0NvbGxlY3Rpb24ucmVtb3ZlKGNvbnRhY3RJZCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuIE1ldGVvci5FcnJvcignT3BlcmF0aW9uIE5vdCBBdXRob3JpemVkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxuICAgICdjb250YWN0cy5lZGl0Jyhjb250YWN0KSB7XHJcbiAgICAgICAgY29uc3QgeyBfaWQsIG5hbWUsIGVtYWlsLCBwaG9uZSwgdGFncyB9ID0gY29udGFjdDtcclxuICAgICAgICBpZiAoY2hlY2tVc2VyUm9sZShwZXJtaXNzaW9uLkVESVRfQ09OVEFDVCkpIHtcclxuICAgICAgICAgICAgQ29udGFjdHNDb2xsZWN0aW9uLnVwZGF0ZShfaWQsIHtcclxuICAgICAgICAgICAgICAgICRzZXQ6IHtcclxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBuYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgIGVtYWlsOiBlbWFpbCxcclxuICAgICAgICAgICAgICAgICAgICBwaG9uZTogcGhvbmUsXHJcbiAgICAgICAgICAgICAgICAgICAgdGFnczogdGFncyxcclxuICAgICAgICAgICAgICAgICAgICBtb2RpZmllZEJ5OiB0aGlzLnVzZXJJZCxcclxuICAgICAgICAgICAgICAgICAgICBtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignT3BlcmF0aW9uIE5vdCBhdXRob3JpemVkLicpO1xyXG4gICAgICAgIH1cclxuICAgIH0sXHJcbn0pO1xyXG4iLCJpbXBvcnQgeyBjaGVjayB9IGZyb20gJ21ldGVvci9jaGVjayc7XHJcbmltcG9ydCB7IE9yZ2FuaXphdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vY29sbGVjdGlvbi9Pcmdhbml6YXRpb25zQ29sbGVjdGlvbic7XHJcbmltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xyXG5pbXBvcnQgeyBwZXJtaXNzaW9uIH0gZnJvbSAnLi4vZGVjbGVyYXRpb24vcGVybWlzc2lvbic7XHJcbmltcG9ydCB7IGNoZWNrVXNlclJvbGUgfSBmcm9tICcuLi9jaGVja3MvY2hlY2tVc2VyUm9sZXMnO1xyXG5cclxuTWV0ZW9yLm1ldGhvZHMoe1xyXG4gICAgJ29yZ2FuaXphdGlvbnMuY3JlYXRlJyhvcmdhbml6YXRpb25EZXRhaWxzKSB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBNZXRlb3IudXNlcigpO1xyXG4gICAgICAgIGNoZWNrKG9yZ2FuaXphdGlvbkRldGFpbHMsIE9iamVjdCk7XHJcbiAgICAgICAgaWYgKCFvcmdhbml6YXRpb25EZXRhaWxzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ05vIG9yZ2FuaXphdGlvbiBmb3VuZC4nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNoZWNrVXNlclJvbGUocGVybWlzc2lvbi5DUkVBVEVfT1JHQU5JWkFUSU9OKSkge1xyXG4gICAgICAgICAgICBpZiAoY3VycmVudFVzZXIpXHJcbiAgICAgICAgICAgICAgICBPcmdhbml6YXRpb25zQ29sbGVjdGlvbi5pbnNlcnQoe1xyXG4gICAgICAgICAgICAgICAgICAgIC4uLm9yZ2FuaXphdGlvbkRldGFpbHMsXHJcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignT3BlcmF0aW9uIE5vdCBBdXRob3JpemVkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxuXHJcbiAgICAnb3JnYW5pemF0aW9ucy5yZW1vdmUnKG9yZ2FuaXphdGlvbklkKSB7XHJcbiAgICAgICAgY2hlY2sob3JnYW5pemF0aW9uSWQsIFN0cmluZyk7XHJcbiAgICAgICAgY29uc3Qgb3JnYW5pemF0aW9uID0gT3JnYW5pemF0aW9uc0NvbGxlY3Rpb24uZmluZE9uZSh7XHJcbiAgICAgICAgICAgIF9pZDogb3JnYW5pemF0aW9uSWQsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWYgKCFvcmdhbml6YXRpb24pIHtcclxuICAgICAgICAgICAgTWV0ZW9yLkVycm9yKFwiT3JnYW5pemF0aW9uIGRvZXNuJ3QgZXhpc3RcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChjaGVja1VzZXJSb2xlKHBlcm1pc3Npb24uUkVNT1ZFX09SR0FOSVpBVElPTikpIHtcclxuICAgICAgICAgICAgT3JnYW5pemF0aW9uc0NvbGxlY3Rpb24ucmVtb3ZlKG9yZ2FuaXphdGlvbklkKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gTWV0ZW9yLkVycm9yKCdPcGVyYXRpb24gTm90IEF1dGhvcml6ZWQnKTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG5cclxuICAgICdvcmdhbml6YXRpb25zLmVkaXQnKG9yZ2FuaXphdGlvbikge1xyXG4gICAgICAgIGlmIChjaGVja1VzZXJSb2xlKHBlcm1pc3Npb24uRURJVF9PUkdBTklaQVRJT04pKSB7XHJcbiAgICAgICAgICAgIE9yZ2FuaXphdGlvbnNDb2xsZWN0aW9uLnVwZGF0ZShvcmdhbml6YXRpb24uX2lkLCB7XHJcbiAgICAgICAgICAgICAgICAkc2V0OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgLi4ub3JnYW5pemF0aW9uLFxyXG4gICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkQnk6IHRoaXMudXNlcklkLFxyXG4gICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCksXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdPcGVyYXRpb24gTm90IGF1dGhvcml6ZWQuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxufSk7XHJcbiIsImltcG9ydCB7IFRhZ3NDb2xsZWN0aW9uIH0gZnJvbSAnLi4vY29sbGVjdGlvbi9UYWdzQ29sbGVjdGlvbic7XHJcbmltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xyXG5pbXBvcnQgeyBjaGVjayB9IGZyb20gJ21ldGVvci9jaGVjayc7XHJcbmltcG9ydCB7IHBlcm1pc3Npb24gfSBmcm9tICcuLi9kZWNsZXJhdGlvbi9wZXJtaXNzaW9uJztcclxuaW1wb3J0IHsgY2hlY2tVc2VyUm9sZSB9IGZyb20gJy4uL2NoZWNrcy9jaGVja1VzZXJSb2xlcyc7XHJcblxyXG5NZXRlb3IubWV0aG9kcyh7XHJcbiAgICAndGFncy5jcmVhdGUnKHRhZ3NEZXRhaWxzKSB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFVzZXIgPSBNZXRlb3IudXNlcigpO1xyXG4gICAgICAgIGNoZWNrKHRhZ3NEZXRhaWxzLCBPYmplY3QpO1xyXG4gICAgICAgIGlmICghdGFnc0RldGFpbHMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignTm8gdGFncyBmb3VuZC4nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNoZWNrVXNlclJvbGUocGVybWlzc2lvbi5DUkVBVEVfVEFHKSkge1xyXG4gICAgICAgICAgICBpZiAoY3VycmVudFVzZXIpXHJcbiAgICAgICAgICAgICAgICBUYWdzQ29sbGVjdGlvbi5pbnNlcnQoe1xyXG4gICAgICAgICAgICAgICAgICAgIC4uLnRhZ3NEZXRhaWxzLFxyXG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcclxuICAgICAgICAgICAgICAgICAgICB1c2VySWQ6IHRoaXMudXNlcklkLFxyXG4gICAgICAgICAgICAgICAgICAgIG9yZ2FuaXphdGlvbklkOiBjdXJyZW50VXNlci5wcm9maWxlLm9yZ2FuaXphdGlvbklkLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignT3BlcmF0aW9uIE5vdCBhdXRob3JpemVkLicpO1xyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgJ3RhZ3MucmVtb3ZlJyh0YWdJZCkge1xyXG4gICAgICAgIGNoZWNrKHRhZ0lkLCBTdHJpbmcpO1xyXG4gICAgICAgIGNvbnN0IHRhZyA9IFRhZ3NDb2xsZWN0aW9uLmZpbmRPbmUoe1xyXG4gICAgICAgICAgICBfaWQ6IHRhZ0lkLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmICghdGFnKSB7XHJcbiAgICAgICAgICAgIE1ldGVvci5FcnJvcihcIk9yZ2FuaXphdGlvbiBkb2Vzbid0IGV4aXN0XCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2hlY2tVc2VyUm9sZShwZXJtaXNzaW9uLlJFTU9WRV9UQUcpKSB7XHJcbiAgICAgICAgICAgIFRhZ3NDb2xsZWN0aW9uLnJlbW92ZSh0YWdJZCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuIE1ldGVvci5FcnJvcignT3BlcmF0aW9uIE5vdCBBdXRob3JpemVkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxuICAgICd0YWdzLmVkaXQnKHRhZykge1xyXG4gICAgICAgIGNvbnN0IHsgX2lkLCBuYW1lIH0gPSB0YWc7XHJcbiAgICAgICAgaWYgKGNoZWNrVXNlclJvbGUocGVybWlzc2lvbi5FRElUX1RBRykpIHtcclxuICAgICAgICAgICAgVGFnc0NvbGxlY3Rpb24udXBkYXRlKF9pZCwge1xyXG4gICAgICAgICAgICAgICAgJHNldDoge1xyXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWRCeTogdGhpcy51c2VySWQsXHJcbiAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWRBdDogbmV3IERhdGUoKSxcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ09wZXJhdGlvbiBOb3QgYXV0aG9yaXplZC4nKTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG59KTtcclxuIiwiaW1wb3J0IHsgQWNjb3VudHMgfSBmcm9tICdtZXRlb3IvYWNjb3VudHMtYmFzZSc7XHJcbmltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xyXG5pbXBvcnQgeyBjaGVjayB9IGZyb20gJ21ldGVvci9jaGVjayc7XHJcbmltcG9ydCB7IHBlcm1pc3Npb24gfSBmcm9tICcuLi9kZWNsZXJhdGlvbi9wZXJtaXNzaW9uJztcclxuaW1wb3J0IHsgY2hlY2tVc2VyUm9sZSB9IGZyb20gJy4uL2NoZWNrcy9jaGVja1VzZXJSb2xlcyc7XHJcblxyXG5NZXRlb3IubWV0aG9kcyh7XHJcbiAgICAndXNlcnMuY3JlYXRlJyh1c2VyRGV0YWlscykge1xyXG4gICAgICAgIGlmIChjaGVja1VzZXJSb2xlKHBlcm1pc3Npb24uQ1JFQVRFX1VTRVIpKSB7XHJcbiAgICAgICAgICAgIGlmICghQWNjb3VudHMuZmluZFVzZXJCeVVzZXJuYW1lKHVzZXJEZXRhaWxzLnVzZXJuYW1lKSkge1xyXG4gICAgICAgICAgICAgICAgQWNjb3VudHMuY3JlYXRlVXNlcih1c2VyRGV0YWlscyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgTWV0ZW9yLkVycm9yKCdPcGVyYXRpb24gTm90IGF1dGhvcml6ZWQuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICghQWNjb3VudHMuZmluZFVzZXJCeVVzZXJuYW1lKHVzZXJEZXRhaWxzLnVzZXJuYW1lKSkge1xyXG4gICAgICAgICAgICBBY2NvdW50cy5jcmVhdGVVc2VyKHVzZXJEZXRhaWxzKTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG4gICAgJ3VzZXJzLnJlbW92ZScodXNlcklkKSB7XHJcbiAgICAgICAgY2hlY2sodXNlcklkLCBTdHJpbmcpO1xyXG4gICAgICAgIGlmIChjaGVja1VzZXJSb2xlKHBlcm1pc3Npb24uUkVNT1ZFX1VTRVIpKSB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy51c2VySWQpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ09wZXJhdGlvbiBub3QgYXV0aG9yaXplZC4nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAodGhpcy51c2VySWQgPT09IHVzZXJJZCkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignQ2Fubm90IGRlbGV0ZSBteXNlbGYnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBNZXRlb3IudXNlcnMucmVtb3ZlKHVzZXJJZCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IE1ldGVvci5FcnJvcignT3BlcmF0aW9uIG5vdCBhdXRob3JpemVkLicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBNZXRlb3IudXNlcnMucmVtb3ZlKHtcclxuICAgICAgICAgICAgX2lkOiB1c2VySWQsXHJcbiAgICAgICAgICAgICdwcm9maWxlLnJvbGUnOiB7ICRuZTogJ2tlZWxhQWRtaW4nIH0sXHJcbiAgICAgICAgfSk7XHJcbiAgICB9LFxyXG4gICAgJ3VzZXJzLnVwZGF0ZScodXNlcikge1xyXG4gICAgICAgIGlmIChjaGVja1VzZXJSb2xlKHBlcm1pc3Npb24uRURJVF9VU0VSKSkge1xyXG4gICAgICAgICAgICBNZXRlb3IudXNlcnMudXBkYXRlKFxyXG4gICAgICAgICAgICAgICAgeyBfaWQ6IHVzZXIudXNlcklkIH0sXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgJHNldDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB1c2VybmFtZTogdXNlci51cGRhdGVzLnVzZXJuYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAncHJvZmlsZS5yb2xlJzogdXNlci51cGRhdGVzWydwcm9maWxlLnJvbGUnXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3Byb2ZpbGUub3JnYW5pemF0aW9uSWQnOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXNlci51cGRhdGVzWydwcm9maWxlLm9yZ2FuaXphdGlvbklkJ10sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdwcm9maWxlLm9yZ2FuaXphdGlvbk5hbWUnOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXNlci51cGRhdGVzWydwcm9maWxlLm9yZ2FuaXphdGlvbk5hbWUnXSxcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBNZXRlb3IuRXJyb3IoJ09wZXJhdGlvbiBub3QgYXV0aG9yaXplZC4nKTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG59KTtcclxuIiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcidcclxuaW1wb3J0IHsgQ29udGFjdHNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vY29sbGVjdGlvbi9Db250YWN0c0NvbGxlY3Rpb24nXHJcblxyXG5NZXRlb3IucHVibGlzaCgnY29udGFjdHMnLCBmdW5jdGlvbiBwdWJsaXNoQ29udGFjdHMoKSB7XHJcbiAgICBjb25zdCBjdXJyZW50VXNlciA9IE1ldGVvci51c2VyKClcclxuICAgIGlmIChcclxuICAgICAgICBjdXJyZW50VXNlciAmJlxyXG4gICAgICAgIGN1cnJlbnRVc2VyLnByb2ZpbGUgJiZcclxuICAgICAgICBjdXJyZW50VXNlci5wcm9maWxlLm9yZ2FuaXphdGlvbklkXHJcbiAgICApIHtcclxuICAgICAgICByZXR1cm4gQ29udGFjdHNDb2xsZWN0aW9uLmZpbmQoe1xyXG4gICAgICAgICAgICBvcmdhbml6YXRpb25JZDogY3VycmVudFVzZXIucHJvZmlsZS5vcmdhbml6YXRpb25JZCxcclxuICAgICAgICB9KVxyXG4gICAgfVxyXG4gICAgcmV0dXJuXHJcbn0pXHJcbiIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InXHJcbmltcG9ydCB7IE9yZ2FuaXphdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vY29sbGVjdGlvbi9Pcmdhbml6YXRpb25zQ29sbGVjdGlvbidcclxuXHJcbk1ldGVvci5wdWJsaXNoKCdvcmdhbml6YXRpb25zJywgZnVuY3Rpb24gcHVibGlzaE9yZ2FuaXphdGlvbnMoKSB7XHJcbiAgICByZXR1cm4gT3JnYW5pemF0aW9uc0NvbGxlY3Rpb24uZmluZCh7fSlcclxufSlcclxuIiwiaW1wb3J0IHsgTWV0ZW9yIH0gZnJvbSAnbWV0ZW9yL21ldGVvcidcclxuaW1wb3J0IHsgVGFnc0NvbGxlY3Rpb24gfSBmcm9tICcuLi9jb2xsZWN0aW9uL1RhZ3NDb2xsZWN0aW9uJ1xyXG5cclxuTWV0ZW9yLnB1Ymxpc2goJ3RhZ3MnLCBmdW5jdGlvbiBwdWJsaXNoVGFncygpIHtcclxuICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gTWV0ZW9yLnVzZXIoKVxyXG4gICAgaWYgKFxyXG4gICAgICAgIGN1cnJlbnRVc2VyICYmXHJcbiAgICAgICAgY3VycmVudFVzZXIucHJvZmlsZSAmJlxyXG4gICAgICAgIGN1cnJlbnRVc2VyLnByb2ZpbGUub3JnYW5pemF0aW9uSWRcclxuICAgICkge1xyXG4gICAgICAgIHJldHVybiBUYWdzQ29sbGVjdGlvbi5maW5kKHtcclxuICAgICAgICAgICAgb3JnYW5pemF0aW9uSWQ6IGN1cnJlbnRVc2VyLnByb2ZpbGUub3JnYW5pemF0aW9uSWQsXHJcbiAgICAgICAgfSlcclxuICAgIH1cclxuICAgIHJldHVyblxyXG59KVxyXG4iLCJpbXBvcnQgeyBNZXRlb3IgfSBmcm9tICdtZXRlb3IvbWV0ZW9yJztcclxuXHJcbk1ldGVvci5wdWJsaXNoKCd1c2VycycsIGZ1bmN0aW9uIHB1Ymxpc2hVc2VyKCkge1xyXG4gICAgcmV0dXJuIE1ldGVvci51c2Vycy5maW5kKHt9KTtcclxufSk7XHJcbiIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgQWNjb3VudHMgfSBmcm9tICdtZXRlb3IvYWNjb3VudHMtYmFzZSc7XG5cbi8vIENvbGxlY3Rpb25zXG5pbXBvcnQgeyBPcmdhbml6YXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uL2ltcG9ydHMvYXBpL2NvbGxlY3Rpb24vT3JnYW5pemF0aW9uc0NvbGxlY3Rpb24nO1xuaW1wb3J0IHsgVGFnc0NvbGxlY3Rpb24gfSBmcm9tICcuLi9pbXBvcnRzL2FwaS9jb2xsZWN0aW9uL1RhZ3NDb2xsZWN0aW9uJztcbmltcG9ydCB7IENvbnRhY3RzQ29sbGVjdGlvbiB9IGZyb20gJy4uL2ltcG9ydHMvYXBpL2NvbGxlY3Rpb24vQ29udGFjdHNDb2xsZWN0aW9uJztcblxuLy8gTWV0aG9kc1xuaW1wb3J0ICcuLi9pbXBvcnRzL2FwaS9tZXRob2RzL1RhZ3NNZXRob2RzJztcbmltcG9ydCAnLi4vaW1wb3J0cy9hcGkvbWV0aG9kcy9Vc2VyTWV0aG9kcyc7XG5pbXBvcnQgJy4uL2ltcG9ydHMvYXBpL21ldGhvZHMvT3JnYW5pemF0aW9uTWV0aG9kcyc7XG5pbXBvcnQgJy4uL2ltcG9ydHMvYXBpL21ldGhvZHMvQ29udGFjdE1ldGhvZHMnO1xuXG4vLyBQdWJsaWNhdGlvbnNcbmltcG9ydCAnLi4vaW1wb3J0cy9hcGkvcHVibGljYXRpb25zL09yZ2FuaXphdGlvblB1YmxpY2F0aW9uJztcbmltcG9ydCAnLi4vaW1wb3J0cy9hcGkvcHVibGljYXRpb25zL1VzZXJQdWJsaWNhdGlvbic7XG5pbXBvcnQgJy4uL2ltcG9ydHMvYXBpL3B1YmxpY2F0aW9ucy9UYWdzUHVibGljYXRpb24nO1xuaW1wb3J0ICcuLi9pbXBvcnRzL2FwaS9wdWJsaWNhdGlvbnMvQ29udGFjdFB1YmxpY2F0aW9uJztcblxuaW1wb3J0IHsgcm9sZXMgfSBmcm9tICcuLi9pbXBvcnRzL2FwaS9kZWNsZXJhdGlvbi9yb2xlcyc7XG5cbmNvbnN0IEtFRUxBX0FETUlOX1VTRVJOQU1FID0gJ2tlZWxhQWRtaW4nO1xuY29uc3QgQURNSU5fVVNFUk5BTUUgPSAnYWRtaW4nO1xuY29uc3QgQ09PUkRJTkFUT1JfVVNFUk5BTUUgPSAnY29vcmRpbmF0b3InO1xuY29uc3QgUEFTU1dPUkQgPSAncGFzc3dvcmQnO1xuXG5jb25zdCBpbnNlcnRPcmduaXphdGlvbiA9IChvcmdhbml6YXRpb24pID0+IHtcbiAgICBPcmdhbml6YXRpb25zQ29sbGVjdGlvbi5pbnNlcnQoeyAuLi5vcmdhbml6YXRpb24gfSk7XG59O1xuXG5NZXRlb3Iuc3RhcnR1cChhc3luYyAoKSA9PiB7XG4gICAgaWYgKE9yZ2FuaXphdGlvbnNDb2xsZWN0aW9uLmZpbmQoKS5jb3VudCgpID09PSAwKSB7XG4gICAgICAgIFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnbXlPcmdhbml6YXRpb24nLFxuICAgICAgICAgICAgICAgIGVtYWlsOiAnbXlvcmdxYW5pemF0aW9uQGtlZWxhLmNvbScsXG4gICAgICAgICAgICAgICAgYWRkcmVzczogJ215QWRkcmVzcycsXG4gICAgICAgICAgICAgICAgcGhvbmU6ICc5ODk4OTg5ODk4JyxcbiAgICAgICAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdLmZvckVhY2goaW5zZXJ0T3Jnbml6YXRpb24pO1xuICAgIH1cbiAgICBjb25zdCBteU9yZ2FuaXphdGlvbklkID0gT3JnYW5pemF0aW9uc0NvbGxlY3Rpb24uZmluZE9uZSh7XG4gICAgICAgIG5hbWU6ICdteU9yZ2FuaXphdGlvbicsXG4gICAgfSk7XG4gICAgaWYgKCFBY2NvdW50cy5maW5kVXNlckJ5VXNlcm5hbWUoS0VFTEFfQURNSU5fVVNFUk5BTUUpKSB7XG4gICAgICAgIEFjY291bnRzLmNyZWF0ZVVzZXIoe1xuICAgICAgICAgICAgdXNlcm5hbWU6IEtFRUxBX0FETUlOX1VTRVJOQU1FLFxuICAgICAgICAgICAgcGFzc3dvcmQ6IFBBU1NXT1JELFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICAgIHJvbGU6IHJvbGVzLmtlZWxhQWRtaW4sXG4gICAgICAgICAgICAgICAgb3JnYW5pemF0aW9uSWQ6IG15T3JnYW5pemF0aW9uSWQuX2lkLFxuICAgICAgICAgICAgICAgIG9yZ2FuaXphdGlvbk5hbWU6ICdteU9yZ2FuaXphdGlvbicsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoIUFjY291bnRzLmZpbmRVc2VyQnlVc2VybmFtZShBRE1JTl9VU0VSTkFNRSkpIHtcbiAgICAgICAgQWNjb3VudHMuY3JlYXRlVXNlcih7XG4gICAgICAgICAgICB1c2VybmFtZTogQURNSU5fVVNFUk5BTUUsXG4gICAgICAgICAgICBwYXNzd29yZDogUEFTU1dPUkQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgICAgcm9sZTogcm9sZXMuYWRtaW4sXG4gICAgICAgICAgICAgICAgb3JnYW5pemF0aW9uSWQ6IG15T3JnYW5pemF0aW9uSWQuX2lkLFxuICAgICAgICAgICAgICAgIG9yZ2FuaXphdGlvbk5hbWU6ICdteU9yZ2FuaXphdGlvbicsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoIUFjY291bnRzLmZpbmRVc2VyQnlVc2VybmFtZShDT09SRElOQVRPUl9VU0VSTkFNRSkpIHtcbiAgICAgICAgQWNjb3VudHMuY3JlYXRlVXNlcih7XG4gICAgICAgICAgICB1c2VybmFtZTogQ09PUkRJTkFUT1JfVVNFUk5BTUUsXG4gICAgICAgICAgICBwYXNzd29yZDogUEFTU1dPUkQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgICAgcm9sZTogcm9sZXMuY29vcmRpbmF0b3IsXG4gICAgICAgICAgICAgICAgb3JnYW5pemF0aW9uSWQ6IG15T3JnYW5pemF0aW9uSWQuX2lkLFxuICAgICAgICAgICAgICAgIG9yZ2FuaXphdGlvbk5hbWU6ICdteU9yZ2FuaXphdGlvbicsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9XG59KTtcbiJdfQ==
