import { check } from 'meteor/check'
import { OrganizationsCollection } from '../collection/OrganizationsCollection'
import { Meteor } from 'meteor/meteor'
import { permission } from '../decleration/permission'
import { checkUserRole } from '../checks/checkUserRoles'

Meteor.methods({
    'organizations.create'(organizationDetails) {
        const currentUser = Meteor.user()
        check(organizationDetails, Object)
        if (!organizationDetails) {
            throw new Meteor.Error('No organization found.')
        }
        if (checkUserRole(permission.CREATE_ORGANIZATION)) {
            if (currentUser)
                OrganizationsCollection.insert({
                    ...organizationDetails,
                    createdAt: new Date(),
                })
        } else {
            throw new Meteor.Error('Operation Not Authorized')
        }
    },

    'organizations.remove'(organizationId) {
        check(organizationId, String)
        const organization = OrganizationsCollection.findOne({
            _id: organizationId,
        })
        if (!organization) {
            Meteor.Error("Organization doesn't exist")
        }
        if (checkUserRole(permission.REMOVE_ORGANIZATION)) {
            OrganizationsCollection.remove(organizationId)
        } else {
            return Meteor.Error('Operation Not Authorized')
        }
    },

    'organizations.edit'(organization) {
        if (checkUserRole(permission.EDIT_ORGANIZATION)) {
            OrganizationsCollection.update(organization._id, {
                $set: {
                    ...organization,
                    modifiedBy: this.userId,
                    modifiedAt: new Date(),
                },
            })
        } else {
            throw new Meteor.Error('Operation Not authorized.')
        }
    },
})
