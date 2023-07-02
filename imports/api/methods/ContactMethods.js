import { check } from 'meteor/check';
import { ContactsCollection } from '../collection/ContactsCollection';
import { Meteor } from 'meteor/meteor';
import { permission } from '../decleration/permission';
import { checkUserRole } from '../checks/checkUserRoles';

Meteor.methods({
    'contacts.create'(contactDetails) {
        const currentUser = Meteor.user();
        check(contactDetails, Object);
        if (!contactDetails) {
            throw new Meteor.Error('No contact found.');
        }
        if (checkUserRole(permission.CREATE_CONTACT)) {
            if (currentUser)
                ContactsCollection.insert({
                    ...contactDetails,
                    createdAt: new Date(),
                });
        } else {
            throw new Meteor.Error('Operation Not Authorized');
        }
    },

    'contacts.remove'(contactId) {
        check(contactId, String);
        const contact = ContactsCollection.findOne({
            _id: contactId,
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
        const { _id, name, email, phone } = contact;
        if (checkUserRole(permission.EDIT_CONTACT)) {
            ContactsCollection.update(_id, {
                $set: {
                    name: name,
                    email: email,
                    phone: phone,
                    modifiedBy: this.userId,
                    modifiedAt: new Date(),
                },
            });
        } else {
            throw new Meteor.Error('Operation Not authorized.');
        }
    },
});
