<template>
    <Alert ref="alertsComponent" :message="alertMessage" :type="alertType" />

    <div
        class="p-4 border-2 border-gray-200 border-spacing-0 rounded-lg dark:border-gray-700 mt-[15px]"
    >
        <div class="flex items-center justify-between">
            <!-- Modal toggle -->
            <div class="text-xl font-semibold">Organizations</div>
            <button
                v-if="organizationCreateAccess"
                @click="openModal"
                class="block text-white bg-indigo-700 hover:bg-indigo-800 focus:ring-4 focus:outline-none focus:ring-indigo-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-indigo-600 dark:hover:bg-indigo-700 dark:focus:ring-indigo-800"
                type="button"
            >
                Create Organization
            </button>
        </div>
    </div>
    <div v-if="showModal" class="fixed inset-0 bg-black opacity-50 z-50"></div>

    <!-- Main modal -->
    <div
        v-if="showModal"
        id="authentication-modal"
        tabindex="-1"
        aria-hidden="true"
        class="flex justify-center fixed top left-0 right-0 z-50 w-full p-4 overflow-x-hidden overflow-y-auto md:inset-0 h-[calc(100%-1rem)] max-h-full bg-opacity-75 drop-shadow-md"
    >
        <div class="relative w-full max-w-md max-h-full">
            <!-- Modal content -->
            <div class="relative bg-white rounded-lg shadow dark:bg-gray-700">
                <button
                    type="button"
                    class="absolute top-3 right-2.5 text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center dark:hover:bg-gray-800 dark:hover:text-white"
                    @click="closeModal"
                >
                    <svg
                        aria-hidden="true"
                        class="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            fill-rule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clip-rule="evenodd"
                        ></path>
                    </svg>
                    <span class="sr-only">Close modal</span>
                </button>
                <div class="px-6 py-6 lg:px-8">
                    <h3
                        class="mb-4 text-xl font-medium text-gray-900 dark:text-white"
                    >
                        {{
                            mode === 'add'
                                ? 'Enter Organization Details'
                                : 'Update Organization Details'
                        }}
                    </h3>
                    <form class="space-y-6" @submit.prevent="handleSubmit">
                        <div>
                            <label
                                for="name"
                                class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                                >Organization Name</label
                            >
                            <input
                                v-model="doc.name"
                                type="text"
                                name="name"
                                id="name"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                                placeholder="Organization Name"
                                required
                            />
                        </div>
                        <div>
                            <label
                                for="email"
                                class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                                >Organization Email</label
                            >
                            <input
                                v-model="doc.email"
                                type="email"
                                name="email"
                                id="email"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                                placeholder="Organization Email"
                                required
                            />
                        </div>
                        <div>
                            <label
                                for="address"
                                class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                                >Organization Address</label
                            >
                            <input
                                v-model="doc.address"
                                type="text"
                                name="address"
                                id="address"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                                placeholder="Organization Address"
                                required
                            />
                        </div>
                        <div>
                            <label
                                for="phone"
                                class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                                >Organization Phone</label
                            >
                            <input
                                v-model="doc.phone"
                                type="number"
                                name="phone"
                                id="phone"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                                placeholder="Organization Phone"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            class="w-full text-white bg-indigo-700 hover:bg-indigo-800 focus:ring-4 focus:outline-none focus:ring-indigo-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-indigo-600 dark:hover:bg-indigo-700 dark:focus:ring-indigo-800"
                        >
                            {{
                                mode === 'add'
                                    ? 'Create Organization'
                                    : 'Update Organization'
                            }}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    <div
        v-if="organizationViewAccess"
        class="p-4 border-2 border-gray-200 border-spacing-0 rounded-lg dark:border-gray-700 mt-[15px]"
    >
        <div class="relative overflow-x-auto">
            <table
                class="w-full text-sm text-left text-gray-500 dark:text-gray-400"
            >
                <thead
                    class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400"
                >
                    <tr>
                        <th scope="col" class="px-6 py-3">Organization Name</th>
                        <th scope="col" class="px-6 py-3">Email</th>
                        <th scope="col" class="px-6 py-3">Address</th>
                        <th scope="col" class="px-6 py-3">Phone</th>
                        <th
                            v-if="
                                organizationDeleteAccess ||
                                organizationEditAccess
                            "
                            scope="col"
                            class="px-6 py-3"
                        >
                            Action
                        </th>
                    </tr>
                </thead>
                <tbody v-if="this.organizations.length > 0">
                    <tr
                        v-for="organization in organizations"
                        :key="organization._id"
                        class="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                    >
                        <th
                            scope="row"
                            class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white"
                        >
                            {{ organization.name }}
                        </th>
                        <td class="px-6 py-4">{{ organization.email }}</td>
                        <td class="px-6 py-4">{{ organization.address }}</td>
                        <td class="px-6 py-4">{{ organization.phone }}</td>
                        <td>
                            <button
                                v-if="organizationEditAccess"
                                type="button"
                                @click="openEditModal(organization)"
                                class="focus:outline-none text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
                            >
                                Edit
                            </button>
                            <button
                                v-if="organizationDeleteAccess"
                                type="button"
                                @click="deleteOrganization(organization._id)"
                                class="focus:outline-none text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900"
                            >
                                Delete
                            </button>
                        </td>
                    </tr>
                </tbody>
                <tbody v-else>
                    <tr
                        class="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                    >
                        <div class="px-6 py-4 font-semibold">
                            No Organization Found ....
                        </div>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
    <div
        v-else
        class="p-4 border-2 border-gray-200 border-spacing-0 rounded-lg dark:border-gray-700 mt-[15px]"
    >
        Sorry, Not Authorized
    </div>
</template>

<script>
import { Meteor } from 'meteor/meteor';
import { OrganizationsCollection } from '../../../api/collection/OrganizationsCollection';
import { checkUserRole } from '../../../api/checks/checkUserRoles';
import { permission } from '../../../api/decleration/permission';
import Alert from '../Alerts.vue';

const organizationData = {
    name: '',
    email: '',
    address: '',
    phone: '',
};
export default {
    components: {
        Alert,
    },
    name: 'Organizations',
    data() {
        return {
            mode: 'add',
            showModal: false,
            doc: { ...organizationData },
            alertType: '',
            alertMessage: '',
        };
    },
    computed: {
        organizationCreateAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.CREATE_ORGANIZATION, this.currentUser)
            );
        },
        organizationViewAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.VIEW_ORGANIZATION, this.currentUser)
            );
        },
        organizationEditAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.EDIT_ORGANIZATION, this.currentUser)
            );
        },
        organizationDeleteAccess() {
            return (
                this.currentUser &&
                checkUserRole(permission.REMOVE_ORGANIZATION, this.currentUser)
            );
        },
    },
    meteor: {
        currentUser() {
            return Meteor.user();
        },
        $subscribe: {
            organizations: [],
        },
        organizations() {
            return OrganizationsCollection.find(
                {},
                { sort: { createdAt: -1 } }
            ).fetch();
        },
    },
    methods: {
        showAlerts(type, message) {
            this.alertType = type;
            this.alertMessage = message;
            this.$refs.alertsComponent.showAlertMessage();
        },
        openModal() {
            this.mode = 'add';
            this.showModal = true;
        },
        openEditModal(organizationData) {
            this.mode = 'edit';
            this.showModal = true;
            this.doc = { ...organizationData };
        },
        closeModal() {
            this.showModal = false;
            this.doc = { ...organizationData };
        },
        deleteOrganization(organizationId) {
            Meteor.call('organizations.remove', organizationId);
            this.showAlerts('error', 'Organization Deleted Successfully');
        },
        async handleSubmit() {
            try {
                if (this.mode === 'add') {
                    const existingOrganization =
                        OrganizationsCollection.findOne({
                            email: this.doc.email,
                        });
                    if (existingOrganization) {
                        this.showAlerts(
                            'error',
                            'An Organization with the Same Email Already Exists.'
                        );
                        return;
                    }
                    await Meteor.call('organizations.create', {
                        ...this.doc,
                        userId: this.currentUser._id,
                    });
                    this.showAlerts(
                        'success',
                        'Organization Created Successfully'
                    );
                } else if (this.mode === 'edit') {
                    await Meteor.call('organizations.edit', {
                        ...this.doc,
                        userId: this.currentUser._id,
                    });
                    this.showAlerts(
                        'success',
                        'Organization Updated Successfully'
                    );
                }
            } catch (error) {
                alert(error.message);
            }
            this.closeModal();
        },
    },
};
</script>
