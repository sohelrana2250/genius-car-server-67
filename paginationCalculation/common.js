const paginationQuery = (skip, limit) => {
  return [
    {
      $lookup: {
        from: "categorie", // The collection to join with
        localField: "categorieId", // The field from the 'products' collection
        foreignField: "_id", // The field from the 'categories' collection
        as: "categoryDetails", // The name for the array to store the joined data
      },
    },
    {
      $unwind: "$categoryDetails", // Unwind the array to flatten the result
    },
    {
      $skip: skip,
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 1,
        name: 1,
        photo: 1,
        price: 1,
        discount: 1,
        companyName: 1,
        available: 1,
        createdAt: 1,
        "categoryDetails.categorie": 1, // Include only the required fields from the joined data
      },
    },
  ];
};
module.exports = {
  paginationQuery,
};
