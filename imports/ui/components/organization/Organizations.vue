<template>
    <div
        class="p-4 border-2 border-gray-200 border-spacing-0 rounded-lg dark:border-gray-700 mt-[15px]"
    >
        <div class="flex items-start justify-end">
            <router-link
                to="/organization/create"
                class="block text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                type="button"
            >
                Add Organization
            </router-link>
        </div>
    </div>
    <div
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
                        <th scope="col" class="px-6 py-3">Action</th>
                    </tr>
                </thead>
                <tbody>
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
                            <router-link
                                :to="{
                                    path:
                                        '/organization/' +
                                        organization._id +
                                        '/edit',
                                }"
                                type="button"
                                class="focus:outline-none text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
                            >
                                Edit
                            </router-link>
                            <button
                                type="button"
                                class="focus:outline-none text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900"
                            >
                                Delete
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script>
import { Meteor } from 'meteor/meteor'
import { OrganizationsCollection } from '../../../api/collection/OrganizationsCollection'

export default {
    name: 'Organizations',
    data() {
        return {
            name: '',
            email: '',
            address: '',
            phone: '',
        }
    },
    meteor: {
        currentUser() {
            return Meteor.user()
        },
        $subscribe: {
            organizations: [],
        },
        organizations() {
            return OrganizationsCollection.find({}).fetch()
        },
    },
    methods: {
        async handleSubmit() {
            try {
                await Meteor.call('organizations.insert', {
                    name: this.name,
                    email: this.email,
                    address: this.address,
                    phone: this.phone,
                    userId: this.currentUser._id,
                })
            } catch (error) {
                alert(error.message)
            }
        },
    },
}
</script>
