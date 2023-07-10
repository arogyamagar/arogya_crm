import { Meteor } from 'meteor/meteor';
import { ContactsCollection } from '../collection/ContactsCollection';

Meteor.publish('contacts', function publishContacts() {
    const currentUser = Meteor.user();
    if (
        currentUser &&
        currentUser.profile &&
        currentUser.profile.organizationId
    ) {
        return ContactsCollection.find({
            organizationId: currentUser.profile.organizationId,
        });
    }
    return;
});
