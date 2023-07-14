<template>
    <nav
        class="fixed top-0 z-50 w-full bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700"
    >
        <div class="px-3 py-3 lg:px-5 lg:pl-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center justify-start">
                    <button
                        data-drawer-target="logo-sidebar"
                        data-drawer-toggle="logo-sidebar"
                        aria-controls="logo-sidebar"
                        type="button"
                        class="inline-flex items-center p-2 text-sm text-gray-500 rounded-lg sm:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
                    >
                        <span class="sr-only">Open sidebar</span>
                        <svg
                            class="w-6 h-6"
                            aria-hidden="true"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                clip-rule="evenodd"
                                fill-rule="evenodd"
                                d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z"
                            ></path>
                        </svg>
                    </button>
                    <router-link to="/" class="flex ml-2 md:mr-24">
                        <img
                            src="https://www.keela.co/wp-content/uploads/logo.png"
                            class="h-8 mr-3"
                            alt="Keela Logo"
                        />
                    </router-link>
                </div>
                <div class="flex items-center">
                    <div class="mr-3 text-md font-semibold">
                        {{ currentUser?.username }}
                    </div>
                    <div class="flex md:order-2" v-on:click="logout">
                        <button
                            type="button"
                            class="text-white bg-indigo-700 hover:bg-indigo-800 focus:ring-4 focus:outline-none focus:ring-indigo-300 font-medium rounded-lg text-sm px-4 py-2 text-center mr-3 md:mr-0"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </nav>

    <SideBar />

    <div class="p-2 sm:ml-64">
        <div class="p-2 mt-14">
            <router-view />
        </div>
    </div>

    <footer
        class="fixed bottom-0 z-40 w-full bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700"
    >
        <div
            class="flex justify-center w-full max-w-screen-3xl p-4 md:flex md:items-center md:justify-center"
        >
            <span
                class="text-sm font-semibold text-gray-500 sm:text-center dark:text-gray-400"
                >© 2023
                <a href="https://keela.co/" class="hover:underline">Keela</a>.
                All Rights Reserved.
            </span>
        </div>
    </footer>
</template>

<script>
import { OrganizationsCollection } from '../../api/collection/OrganizationsCollection';
import SideBar from './SideBar.vue';
export default {
    name: 'Home',
    components: {
        SideBar,
    },
    data() {
        return {};
    },
    meteor: {
        Organizations() {
            return OrganizationsCollection.find({}).fetch();
        },
        currentUser() {
            return Meteor.user();
        },
    },
    methods: {
        logout() {
            Meteor.logout(() => {
                this.$router.push({ name: 'LoginForm' });
            });
        },
    },
};
</script>

<style lang="scss" scoped></style>
