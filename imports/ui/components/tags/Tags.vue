<template>
    <div
        class="p-4 border-2 border-gray-200 border-spacing-0 rounded-lg dark:border-gray-700 mt-[15px]"
    >
        <div class="flex items-center justify-between">
            <!-- Modal toggle -->
            <div class="text-xl font-semibold">Tags</div>
            <button
                @click="openModal"
                class="block text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                type="button"
            >
                Create Tag
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
                        Enter Tag Details
                    </h3>
                    <form class="space-y-6" @submit.prevent="handleSubmit">
                        <div>
                            <label
                                for="name"
                                class="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                                >Tag Name</label
                            >
                            <input
                                v-model="doc.name"
                                type="text"
                                name="name"
                                id="name"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                                placeholder="Tag Name"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            class="w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                        >
                            {{ mode === 'add' ? 'Create Tag' : 'Update Tag' }}
                        </button>
                    </form>
                </div>
            </div>
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
                        <th scope="col" class="px-6 py-3">Tag Name</th>
                        <th scope="col" class="px-6 py-3">Created</th>
                        <th scope="col" class="px-6 py-3">Action</th>
                    </tr>
                </thead>
                <tbody v-if="this.tags.length > 0">
                    <tr
                        v-for="tag in tags"
                        :key="tag._id"
                        class="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
                    >
                        <th
                            scope="row"
                            class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white"
                        >
                            {{ tag.name }}
                        </th>
                        <td class="px-6 py-4">{{ tag.createdAt }}</td>
                        <td>
                            <button
                                type="button"
                                @click="openEditModal(tag)"
                                class="focus:outline-none text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
                            >
                                Edit
                            </button>
                            <button
                                type="button"
                                @click="deleteTag(tag._id)"
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
                            No Tags Found ....
                        </div>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script>
import { Meteor } from 'meteor/meteor'
import { TagsCollection } from '../../../api/collection/TagsCollection'

const tagData = {
    name: '',
}
export default {
    tags: 'Tags',
    data() {
        return {
            mode: 'add',
            showModal: false,
            doc: { ...tagData },
        }
    },
    meteor: {
        currentUser() {
            return Meteor.user()
        },
        $subscribe: {
            tags: [],
        },
        tags() {
            return TagsCollection.find({}, { sort: { createdAt: -1 } }).fetch()
        },
    },
    methods: {
        openModal() {
            this.mode = 'add'
            this.showModal = true
        },
        openEditModal(tagData) {
            this.mode = 'edit'
            this.showModal = true
            this.doc = { ...tagData }
        },
        closeModal() {
            this.showModal = false
            this.doc = { ...tagData }
        },
        deleteTag(tagId) {
            Meteor.call('tags.remove', tagId)
        },
        async handleSubmit() {
            try {
                if (this.mode === 'add') {
                    await Meteor.call('tags.create', {
                        ...this.doc,
                        userId: this.currentUser._id,
                    })
                } else if (this.mode === 'edit') {
                    await Meteor.call('tags.edit', {
                        ...this.doc,
                        userId: this.currentUser._id,
                    })
                }
            } catch (error) {
                alert(error.message)
            }
            this.closeModal()
        },
    },
}
</script>
