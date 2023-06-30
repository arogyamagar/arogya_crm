<template>
    <aside
        id="logo-sidebar"
        class="fixed top-0 left-0 z-40 w-64 h-screen pt-20 transition-transform -translate-x-full bg-white border-r border-gray-200 sm:translate-x-0 dark:bg-gray-800 dark:border-gray-700"
        aria-label="Sidebar"
    >
        <div class="h-full px-3 pb-4 overflow-y-auto bg-white dark:bg-gray-800">
            <ul class="space-y-2 font-medium">
                <li>
                    <router-link
                        to="/"
                        class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <svg
                            aria-hidden="true"
                            class="w-6 h-6 text-gray-500 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"
                            ></path>
                            <path
                                d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"
                            ></path>
                        </svg>
                        <span class="ml-3">Dashboard</span>
                    </router-link>
                </li>
                <li v-if="orgCreateAccess || orgViewAccess">
                    <router-link
                        to="/organization"
                        class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <svg
                            aria-hidden="true"
                            class="flex-shrink-0 w-6 h-6 text-gray-500 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                            ></path>
                        </svg>
                        <span class="flex-1 ml-3 whitespace-nowrap"
                            >Organizations</span
                        >
                    </router-link>
                </li>

                <li v-if="userCreateAccess || userViewAccess">
                    <router-link
                        to="/users"
                        class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <svg
                            aria-hidden="true"
                            class="flex-shrink-0 w-6 h-6 text-gray-500 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                                clip-rule="evenodd"
                            ></path>
                        </svg>
                        <span class="flex-1 ml-3 whitespace-nowrap">Users</span>
                    </router-link>
                </li>
                <li v-if="tagCreateAccess || tagViewAccess">
                    <router-link
                        to="/tags"
                        class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <svg
                            aria-hidden="true"
                            class="flex-shrink-0 w-6 h-6 text-gray-500 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z"
                                clip-rule="evenodd"
                            ></path>
                        </svg>
                        <span class="flex-1 ml-3 whitespace-nowrap">Tags</span>
                    </router-link>
                </li>
                <li v-if="contactCreateAccess || contactViewAccess">
                    <router-link
                        to="/contacts"
                        class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <svg
                            aria-hidden="true"
                            class="flex-shrink-0 w-6 h-6 text-gray-500 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z"
                                clip-rule="evenodd"
                            ></path>
                        </svg>

                        <span class="flex-1 ml-3 whitespace-nowrap"
                            >Contacts</span
                        >
                    </router-link>
                </li>
            </ul>
        </div>
    </aside>
</template>

<script>
import { checkUserRole } from '../../api/checks/checkUserRoles'
import { permission } from '../../api/decleration/permission'
import { OrganizationsCollection } from '../../api/collection/OrganizationsCollection'
import { TagsCollection } from '../../api/collection/TagsCollection'
import { ContactsCollection } from '../../api/collection/ContactsCollection'

export default {
    name: 'SideBar',
    meteor: {
        $subscribe: {
            organizations: [],
            tags: [],
            contacts: [],
            users: [],
            //   tasks: [],
        },
        currentUser() {
            return Meteor.user()
        },
    },
    computed: {
        orgCreateAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.CREATE_ORGANIZATION, this.currentUser)
            )
        },
        orgViewAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.VIEW_ORGANIZATION, this.currentUser)
            )
        },
        tagCreateAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.CREATE_TAG, this.currentUser)
            )
        },
        tagViewAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.VIEW_TAG, this.currentUser)
            )
        },
        contactCreateAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.CREATE_CONTACT, this.currentUser)
            )
        },
        contactViewAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.VIEW_CONTACT, this.currentUser)
            )
        },
        userCreateAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.CREATE_USER, this.currentUser)
            )
        },
        userViewAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.VIEW_USER, this.currentUser)
            )
        },
        organizations() {
            if (!this.currentUser) {
                return []
            }
            const organizations = OrganizationsCollection.find({}).fetch()
            return organizations
        },
        users() {
            if (!this.currentUser) {
                return []
            }
            const users = Meteor.users.find({}).fetch()
            return users
        },
        tags() {
            if (!this.currentUser) {
                return []
            }

            const tags = TagsCollection.find({}).fetch()
            return tags
        },
        contacts() {
            if (!this.currentUser) {
                return []
            }

            const contacts = ContactsCollection.find({}).fetch()
            return contacts
        },
    },
}
</script>
