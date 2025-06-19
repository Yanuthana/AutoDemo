function getUserName(user) {
    return user && user.profile && user.profile.name;
}
const myVariable = "immutable value";

console.log(getUserName(null)); 

let userName = "test user"; 