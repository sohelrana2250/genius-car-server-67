const httpStatus = require("http-status");

const IsAdmin = async (email, usersCollection) => {
  const isAdmin = await usersCollection.findOne(
    { email },
    {
      projection: {
        role: 1,
      },
    }
  );

  if (isAdmin.role !== process.env.IS_USER_ROLE_ADMIN) {
    return {
      status: httpStatus.FORBIDDEN,
      message: "user",
    };
  }

  return "next";
};
module.exports = {
  IsAdmin,
};
