import { check } from 'meteor/check'
import { OrganizationsCollection } from '../collection/OrganizationsCollection'
import { Meteor } from 'meteor/meteor'

Meteor.methods({
    'organizations.insert'(organizationDetails) {
        const user = Meteor.user()
        if (user.profile.role !== 'keelaAdmin') {
            return Meteor.Error('Operation Not Authorized')
        }
        OrganizationsCollection.insert({
            ...organizationDetails,
            createdAt: new Date(),
        })
    },
    'organizations.remove'(organizationId) {
        check(organizationId, String)
        const user = Meteor.user()
        if (user.profile.role !== 'keelaAdmin') {
            return Meteor.Error('Operation Not Authorized')
        }
        const organization = OrganizationsCollection.findOne({
            _id: organizationId,
        })
        if (!organization) {
            Meteor.Error("Organization doesn't exist")
        }
        OrganizationsCollection.remove(organizationId)
    },
    getOrganization(organizationId) {
        // Perform any necessary validation and authorization checks
        return OrganizationsCollection.findOne(organizationId)
    },

    updateOrganization(organization) {
        // Perform any necessary validation and authorization checks
        OrganizationsCollection.update(organization._id, {
            $set: {
                name: organization.name,
                email: organization.email,
                address: organization.address,
                phone: organization.phone,
            },
        })
    },
})
