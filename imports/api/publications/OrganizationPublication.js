import { Meteor } from 'meteor/meteor'
import { OrganizationsCollection } from '../collection/OrganizationsCollection'

Meteor.publish('organizations', function publishOrganizations() {
    return OrganizationsCollection.find({ userId: this.userId })
})
