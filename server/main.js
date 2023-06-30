import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'

// Collections
import { OrganizationsCollection } from '../imports/api/collection/OrganizationsCollection'
import { TagsCollection } from '../imports/api/collection/TagsCollection'
import { ContactsCollection } from '../imports/api/collection/ContactsCollection'

// Methods
import '../imports/api/methods/TagsMethods'
import '../imports/api/methods/UserMethods'
import '../imports/api/methods/OrganizationMethods'
import '../imports/api/methods/ContactMethods'

// Publications
import '../imports/api/publications/OrganizationPublication'
import '../imports/api/publications/TagsPublication'
import '../imports/api/publications/ContactPublication'
import '../imports/api/publications/UserPublication'

import { roles } from '../imports/api/decleration/roles'

const KEELA_ADMIN_USERNAME = 'keelaAdmin'
const ADMIN_USERNAME = 'admin'
const COORDINATOR_USERNAME = 'coordinator'
const PASSWORD = 'password'

const insertOrgnization = (organization) => {
    OrganizationsCollection.insert({ ...organization })
}

Meteor.startup(async () => {
    if (OrganizationsCollection.find().count() === 0) {
        ;[
            {
                name: 'myOrganization',
                email: 'myorgqanization@keela.com',
                address: 'myAddress',
                phone: '9898989898',
                createdAt: new Date(),
            },
        ].forEach(insertOrgnization)
    }
    const myOrganizationId = OrganizationsCollection.findOne({
        name: 'myOrganization',
    })
    if (!Accounts.findUserByUsername(KEELA_ADMIN_USERNAME)) {
        Accounts.createUser({
            username: KEELA_ADMIN_USERNAME,
            password: PASSWORD,
            profile: {
                role: roles.keelaAdmin,
                organizationId: myOrganizationId._id,
                organizationName: 'myOrganization',
            },
        })
    }

    if (!Accounts.findUserByUsername(ADMIN_USERNAME)) {
        Accounts.createUser({
            username: ADMIN_USERNAME,
            password: PASSWORD,
            profile: {
                role: roles.admin,
                organizationId: myOrganizationId._id,
                organizationName: 'myOrganization',
            },
        })
    }

    if (!Accounts.findUserByUsername(COORDINATOR_USERNAME)) {
        Accounts.createUser({
            username: COORDINATOR_USERNAME,
            password: PASSWORD,
            profile: {
                role: roles.coordinator,
                organizationId: myOrganizationId._id,
                organizationName: 'myOrganization',
            },
        })
    }
})
