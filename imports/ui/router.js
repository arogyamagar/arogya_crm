import { createRouter, createWebHistory } from 'vue-router'
import Home from './components/Home.vue'
import LoginForm from './components/LoginForm.vue'
import SideBar from './components/SideBar.vue'
import NotFound from './components/NotFound.vue'
import Organizations from './components/organization/Organizations.vue'
import CreateOrganization from './components/organization/CreateOrganization.vue'
import EditOrganization from './components/organization/EditOrganization.vue'
import Dashboard from './components/Dashboard.vue'
import Users from './components/users/Users.vue'
import Tags from './components/tags/Tags.vue'

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'Home',
            components: {
                default: Home,
                sideBar: SideBar,
            },
            meta: { requiresAuth: true },
            children: [
                {
                    path: '/',
                    name: 'Dashboard',
                    component: Dashboard,
                },
                {
                    path: '/organization',
                    name: 'Organization',
                    component: Organizations,
                },
                {
                    path: '/organization/create',
                    name: 'CreateOrganization',
                    component: CreateOrganization,
                },
                {
                    path: '/users',
                    name: 'Users',
                    component: Users,
                },
                {
                    path: '/tags',
                    name: 'Tags',
                    component: Tags,
                },
            ],
        },
        {
            path: '/login',
            name: 'LoginForm',
            component: LoginForm,
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'not-found',
            component: NotFound,
        },
    ],
})

router.beforeEach((to, from, next) => {
    if (to.meta.requiresAuth && !Meteor.userId()) {
        next('/login')
    } else {
        next()
    }
})
