import { createRouter, createWebHistory } from "vue-router";
import Home from "./components/Home.vue";
import LoginForm from "./components/LoginForm.vue";
import SideBar from "./components/SideBar.vue";
import NotFound from "./components/NotFound.vue";
import Organizations from "./components/Organizations.vue";
import Users from "./components/Users.vue";
import Tags from "./components/Tags.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "Home",
      components: {
        default: Home,
        // sideBar: SideBar,
      },
      meta: { requiresAuth: true },
      children: [
        {
          path: "/organizations",
          name: "Organizations",
          component: Organizations,
        },
        {
          path: "/users",
          name: "Users",
          component: Users,
        },
        {
          path: "/tags",
          name: "Tags",
          component: Tags,
        },
      ],
    },
    {
      path: "/login",
      name: "LoginForm",
      component: LoginForm,
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: NotFound,
    },
  ],
});

router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !Meteor.userId()) {
    next("/login");
  } else if (to.path === "/login" && Meteor.userId()) {
    next("/");
  } else {
    next();
  }
});
