function getUserName(user) {
    return user && user.profile && user.profile.name ? user.profile.name : null;
}


const myVariable = "immutable value";

try {
    console.log(myVariable);
} catch (error) {
    console.error("Error occurred while logging: " + error);
}

console.log(getUserName(null)); 

let userName = "test user";