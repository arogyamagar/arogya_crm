<template>
    <div class="flex items-center justify-center">
        <div
            class="w-full max-w-lg p-4 sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700 px-6 py-6 lg:px-8"
        >
            <h3 class="mb-4 text-xl font-medium text-gray-900 dark:text-white">
                Register Organization
            </h3>
            <form class="space-y-6" action="" @submit.prevent="handleSubmit">
                <div>
                    <label
                        for="name"
                        class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                        >Organization Name</label
                    >
                    <input
                        type="text"
                        name="name"
                        id="name"
                        class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                        placeholder="Orgnization Name"
                        required
                        v-model="name"
                    />
                </div>
                <div>
                    <label
                        for="organizationame"
                        class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                        >Organization Email</label
                    >
                    <input
                        type="email"
                        name="email"
                        id="email"
                        class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                        placeholder="name@organization.com"
                        required
                        v-model="email"
                    />
                </div>
                <div>
                    <label
                        for="address"
                        class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                        >Organization Address</label
                    >
                    <input
                        type="text"
                        name="address"
                        id="address"
                        class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                        placeholder="Orgnization Address"
                        required
                        v-model="address"
                    />
                </div>
                <div>
                    <label
                        for="phone"
                        class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                        >Organization Phone</label
                    >
                    <input
                        type="number"
                        name="phone"
                        id="phone"
                        class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                        placeholder="Orgnization Phone"
                        required
                        v-model="phone"
                        max="13"
                        min="10"
                    />
                </div>
                <button
                    type="submit"
                    class="w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                >
                    Add Organization
                </button>
            </form>
        </div>
    </div>
</template>

<script>
import { Meteor } from 'meteor/meteor'
import { OrganizationsCollection } from '../../../api/collection/OrganizationsCollection'

export default {
    name: 'CreateOrganization',
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
                this.$router.push('/organization')
            } catch (error) {
                alert(error.message)
            }
        },
    },
}
</script>

<style lang="scss" scoped></style>
