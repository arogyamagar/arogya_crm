<template>
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
        <div
            class="hover:cursor-pointer max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700"
        >
            <svg
                class="w-6 h-6 text-gray-800 dark:text-white"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 20 20"
            >
                <path
                    fill="currentColor"
                    d="M8 1V0v1Zm4 0V0v1Zm2 4v1h1V5h-1ZM6 5H5v1h1V5Zm2-3h4V0H8v2Zm4 0a1 1 0 0 1 .707.293L14.121.879A3 3 0 0 0 12 0v2Zm.707.293A1 1 0 0 1 13 3h2a3 3 0 0 0-.879-2.121l-1.414 1.414ZM13 3v2h2V3h-2Zm1 1H6v2h8V4ZM7 5V3H5v2h2Zm0-2a1 1 0 0 1 .293-.707L5.879.879A3 3 0 0 0 5 3h2Zm.293-.707A1 1 0 0 1 8 2V0a3 3 0 0 0-2.121.879l1.414 1.414ZM2 6h16V4H2v2Zm16 0h2a2 2 0 0 0-2-2v2Zm0 0v12h2V6h-2Zm0 12v2a2 2 0 0 0 2-2h-2Zm0 0H2v2h16v-2ZM2 18H0a2 2 0 0 0 2 2v-2Zm0 0V6H0v12h2ZM2 6V4a2 2 0 0 0-2 2h2Zm16.293 3.293C16.557 11.029 13.366 12 10 12c-3.366 0-6.557-.97-8.293-2.707L.293 10.707C2.557 12.971 6.366 14 10 14c3.634 0 7.444-1.03 9.707-3.293l-1.414-1.414ZM10 9v2a2 2 0 0 0 2-2h-2Zm0 0H8a2 2 0 0 0 2 2V9Zm0 0V7a2 2 0 0 0-2 2h2Zm0 0h2a2 2 0 0 0-2-2v2Z"
                />
            </svg>
            <a href="#">
                <h5
                    class="mt-3 mb-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white"
                >
                    Total Organization
                </h5>
            </a>
            <p
                class="mt-3 mb-3 text-xl font-normal text-gray-500 dark:text-gray-400"
            >
                {{ organizationCount }}
            </p>
        </div>
        <div
            class="hover:cursor-pointer max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700"
        >
            <svg
                class="w-11 h-6 text-gray-800 dark:text-white"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 18 20"
            >
                <path
                    d="M16 0H4a2 2 0 0 0-2 2v1H1a1 1 0 0 0 0 2h1v2H1a1 1 0 0 0 0 2h1v2H1a1 1 0 0 0 0 2h1v2H1a1 1 0 0 0 0 2h1v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2Zm-5.5 4.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM13.929 17H7.071a.5.5 0 0 1-.5-.5 3.935 3.935 0 1 1 7.858 0 .5.5 0 0 1-.5.5Z"
                />
            </svg>
            <a href="#">
                <h5
                    class="mb-2 mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white"
                >
                    Total Contact
                </h5>
            </a>
            <p
                class="mb-3 mt-3 text-xl font-normal text-gray-500 dark:text-gray-400"
            >
                {{ contactCount }}
            </p>
        </div>
        <div
            class="hover:cursor-pointer max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700"
        >
            <svg
                class="w-6 h-6 text-gray-800 dark:text-white"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 21 21"
            >
                <path
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="m6.072 10.072 2 2 6-4m3.586 4.314.9-.9a2 2 0 0 0 0-2.828l-.9-.9a2 2 0 0 1-.586-1.414V5.072a2 2 0 0 0-2-2H13.8a2 2 0 0 1-1.414-.586l-.9-.9a2 2 0 0 0-2.828 0l-.9.9a2 2 0 0 1-1.414.586H5.072a2 2 0 0 0-2 2v1.272a2 2 0 0 1-.586 1.414l-.9.9a2 2 0 0 0 0 2.828l.9.9a2 2 0 0 1 .586 1.414v1.272a2 2 0 0 0 2 2h1.272a2 2 0 0 1 1.414.586l.9.9a2 2 0 0 0 2.828 0l.9-.9a2 2 0 0 1 1.414-.586h1.272a2 2 0 0 0 2-2V13.8a2 2 0 0 1 .586-1.414Z"
                />
            </svg>
            <a href="#">
                <h5
                    class="mt-3 mb-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white"
                >
                    Total Tags
                </h5>
            </a>
            <p
                class="mb-3 mt-3 text-xl font-normal text-gray-500 dark:text-gray-400"
            >
                {{ tagsCount }}
            </p>
        </div>
        <div
            class="hover:cursor-pointer max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700"
        >
            <svg
                aria-hidden="true"
                class="flex-shrink-0 w-6 h-6 text-gray-800 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"
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
            <a href="#">
                <h5
                    class="mt-3 mb-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white"
                >
                    Total Users
                </h5>
            </a>
            <p
                class="mb-3 mt-3 text-xl font-normal text-gray-500 dark:text-gray-400"
            >
                {{ usersCount }}
            </p>
        </div>
    </div>
</template>
<script>
import { OrganizationsCollection } from '../../api/collection/OrganizationsCollection';
import { ContactsCollection } from '../../api/collection/ContactsCollection';
import { TagsCollection } from '../../api/collection/TagsCollection';

export default {
    name: 'Dashboard',

    data() {
        return {};
    },
    computed: {
        organizationCount() {
            return this.organizations.length;
        },
        tagsCount() {
            return this.tags.length;
        },
        contactCount() {
            return this.contacts.length;
        },
        usersCount() {
            return this.users.length;
        },
    },
    meteor: {
        $subscribe: {
            organizations: [],
            contacts: [],
            tags: [],
            users: [],
        },
        users() {
            return Meteor.users.find({}).fetch();
        },
        organizations() {
            return OrganizationsCollection.find({}).fetch();
        },
        tags() {
            return TagsCollection.find({}).fetch();
        },
        contacts() {
            return ContactsCollection.find({}).fetch();
        },
    },
    methods: {
        showDetails(title, description) {
            this.title = title;
            this.description = description;
        },
    },
};
</script>
