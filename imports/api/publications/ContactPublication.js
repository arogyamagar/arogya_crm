import { Meteor } from 'meteor/meteor'
import { ContactsCollection } from '../collection/ContactsCollection'

Meteor.publish('contacts', function publishContacts() {
    return ContactsCollection.find({ userId: this.userId })
})
