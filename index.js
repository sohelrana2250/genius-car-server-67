const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const corn = require("node-cron");
const SSLCommerzPayment = require("sslcommerz-lts");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const {
  specific_data,
  post_data,
  update_data,
  delete_data,
} = require("./reuseable_method/resuable_functions");
const httpStatus = require("http-status");
const { TimeZone } = require("./reuseable_method/TimeZone");
const { paginationQuery } = require("./paginationCalculation/common");
const { paymentGetWay } = require("./reuseable_method/paymentGetway");
const {
  paymentGetWayService,
} = require("./reuseable_method/paymentGetwayService");
const {
  paymentGetWayOldProduct,
} = require("./reuseable_method/paymentGetwayOldProduct");
const { IsAdmin } = require("./reuseable_method/IsAdmin");
const ScheduleCalculation = require("./reuseable_method/ScheduleCalculation");
const {
  PaymentSuccessStatsus,
  scheduleEmails,
} = require("./reuseable_method/CheckedPaymentSuccess");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// middle wares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.witzbq4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// transaction infomation
//ssl commerz functionality
const store_id = process.env.STORE_ID;
const store_password = process.env.STORE_PASSWORD;
const is_live = false; //true for live, false for sandbox

function createToken(user) {
  const token = jwt.sign(
    {
      email: user.email,
    },
    process.env.ACCESS_TOKEN,
    { expiresIn: "7d" }
  );
  return token;
}

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}
async function run() {
  try {
    const serviceCollection = client.db("geniusCar").collection("services");
    const orderCollection = client.db("geniusCar").collection("orders");
    const usersCollection = client.db("geniusCar").collection("user");
    const productsCollection = client.db("geniusCar").collection("products");
    const addToCardCollection = client.db("geniusCar").collection("addToCard");
    const favoriteCollection = client.db("geniusCar").collection("favorite");
    const paymentCollection = client.db("geniusCar").collection("payments");
    const oldproductCollection = client
      .db("geniusCar")
      .collection("oldproducts");
    const servicePaymentCollection = client
      .db("geniusCar")
      .collection("servicepayments");
    const productCategorieCollection = client
      .db("geniusCar")
      .collection("categorie");
    const oldProductAddToCardCollection = client
      .db("geniusCar")
      .collection("oldaddToCard");
    const paymentWithOldProductCollection = client
      .db("geniusCar")
      .collection("oldproductpay");
    // create new collection

    corn.schedule("0 */8 * * *", () => {
      scheduleEmails(orderCollection)
        .then(() => {})
        .catch((error) => console.log(error?.message));
    });

    corn.schedule("* * * * *", () => {
      PaymentSuccessStatsus(servicePaymentCollection)
        .then(() => {})
        .catch((error) => console.log(error?.message));
      PaymentSuccessStatsus(paymentCollection)
        .then(() => {})
        .catch((error) => console.log(error?.message));

      PaymentSuccessStatsus(paymentWithOldProductCollection)
        .then(() => {})
        .catch((error) => console.log(error?.message));
    });

    app.post("/user", async (req, res) => {
      const user = req.body;
      const token = createToken(user);
      const isUserExist = await usersCollection.findOne({ email: user?.email });
      if (isUserExist?._id) {
        return res.send({
          statu: "success",
          message: "Login success",
          token,
        });
      }
      await usersCollection.insertOne(user);
      return res.send({ token });
    });

    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get("/api/v1/services/:id", async (req, res) => {
      const query = {
        _id: new ObjectId(`${req.params.id}`),
      };

      specific_data(serviceCollection, query)
        .then((result) => {
          return res.status(httpStatus.OK).send({
            success: true,
            message: "Successfully created categorie",
            status: httpStatus.OK,
            data: result,
          });
        })
        .catch((error) => {
          return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
            success: false,
            message: error?.message,
            status: httpStatus.INTERNAL_SERVER_ERROR,
          });
        });
    });

    // orders api
    app.get("/orders", async (req, res) => {
      let query = {};

      if (req.query.email) {
        query = {
          email: req.query.email,
        };
      }

      const cursor = orderCollection.find(query);
      const orders = await cursor.toArray();
      res.send(orders);
    });

    app.post("/orders", async (req, res) => {
      // bisiness logic
      const order = req.body;
      order.serviceId = new ObjectId(order.serviceId);
      const todayUTC = new Date();
      const timezoneOffset = 6; // UTC+6 for Bangladesh
      const todayBST = new Date(
        todayUTC.getTime() + timezoneOffset * 60 * 60 * 1000
      );
      const startOfDayBST = new Date(todayBST);
      startOfDayBST.setUTCHours(0, 0, 0, 0);
      const endOfDayBST = new Date(todayBST);
      endOfDayBST.setUTCHours(23, 59, 59, 999);

      // business logic
      const isBooking = await orderCollection.findOne({
        email: order.email, // Filter by email
        serviceId: new ObjectId(order.serviceId), // Filter by serviceId
        date: { $gte: startOfDayBST, $lte: endOfDayBST }, // Match documents where date falls within today
        registerNumber: order?.registerNumber,
      });
      // business logic
      if (isBooking) {
        return res.status(httpStatus.OK).send({
          success: true,
          message: "You Service Already Booking",
          status: httpStatus.OK,
        });
      }
      // execution business logic
      post_data(orderCollection, {
        date: TimeZone(),
        isService: false,
        received: false,
        ...order,
      })
        .then((result) => {
          // send Email
          return res.status(httpStatus.CREATED).send({
            success: true,
            message: "Successfully created categorie",
            status: httpStatus.CREATED,
            data: result,
          });
        })
        .catch((error) => {
          return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
            success: false,
            message: error?.message,
            status: httpStatus.INTERNAL_SERVER_ERROR,
          });
        });
    });

    app.get("/api/v1/allService", async (req, res) => {
      const result = await orderCollection.find({}).toArray();
      res.send(result);
    });

    app.patch("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: status,
        },
      };
      const result = await orderCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    app.post("/api/v1/productcategorie", verifyJWT, async (req, res) => {
      const categorie = req.body;
      const email = req?.decoded?.email;
      const createCatagorie = {
        ...categorie,
        createdAt: new Date(),
      };

      const isExistCategorie = await productCategorieCollection
        .findOne({
          categorie: req.body.categorie,
        })
        .then((data) => data?._id);
      if (isExistCategorie) {
        return res.send({
          status: httpStatus.OK,
          message: "This Categorie Al Ready Exist",
          success: false,
        });
      }

      try {
        const isAdmin = await usersCollection.findOne(
          { email },
          {
            projection: {
              role: 1,
            },
          }
        );

        if (isAdmin.role !== process.env.IS_USER_ROLE_ADMIN) {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }

        post_data(productCategorieCollection, createCatagorie)
          .then((result) => {
            return res.send({
              status: httpStatus.CREATED,
              message: "Successfully Created Categorie",
              success: true,
              data: result,
            });
          })
          .catch((error) => {
            return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
              success: false,
              message: error?.message,
              status: httpStatus.INTERNAL_SERVER_ERROR,
            });
          });
      } catch (error) {}
    });

    app.post("/api/v1/product", async (req, res) => {
      const product = req.body;
      const createProduct = {
        ...product,
        createdAt: new Date(),
      };

      createProduct.categorieId = new ObjectId(createProduct.categorieId);

      // business logic
      const isExistProduct = await productsCollection.findOne({
        name: product.name,
      });

      if (
        isExistProduct?.name?.toLowerCase() === product?.name?.toLowerCase() &&
        isExistProduct?.companyName?.toLowerCase() ===
          product?.companyName?.toLowerCase()
      ) {
        return res.send({
          status: httpStatus.OK,
          message: "This Product Alredy Exist",
          success: true,
        });
      }

      post_data(productsCollection, createProduct)
        .then((result) => {
          return res.send({
            status: httpStatus.CREATED,
            message: "Successfully Created Product",
            success: true,
            data: result,
          });
        })
        .catch((error) => {
          return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
            success: false,
            message: error?.message,
            status: httpStatus.INTERNAL_SERVER_ERROR,
          });
        });
    });

    app.get("/api/v1/allcategorie", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;

      try {
        const isAdmin = await usersCollection.findOne(
          { email },
          {
            projection: {
              role: 1,
            },
          }
        );
        if (isAdmin.role !== process.env.IS_USER_ROLE_ADMIN) {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }

        const result = await productCategorieCollection.find({}).toArray();
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Get All Categorie",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });

    app.get(
      "/api/v1/update_product_categorie/:id",
      verifyJWT,
      async (req, res) => {
        const { id } = req.params;
        try {
          const result = await productCategorieCollection.findOne(
            { _id: new ObjectId(id) },
            {
              projection: {
                categorie: 1,
              },
            }
          );
          res.send({
            success: true,
            status: httpStatus.OK,
            message: "Successfully Get Categorie",
            data: result,
          });
        } catch (error) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
      }
    );
    app.patch(
      "/api/v1/update_product_categorie/:id",
      verifyJWT,
      async (req, res) => {
        const { id } = req.params;
        const email = req?.decoded?.email;
        const data = req.body;
        const filter = {
          _id: new ObjectId(id),
        };
        const updateDoc = {
          $set: {
            categorie: data.categorie,
          },
        };
        try {
          const isAdmin = await usersCollection.findOne(
            { email },
            {
              projection: {
                role: 1,
              },
            }
          );

          if (isAdmin.role !== process.env.IS_USER_ROLE_ADMIN) {
            return res.status(httpStatus.FORBIDDEN).send({
              status: httpStatus.FORBIDDEN,
              message: "You do not have permission to delete categories",
            });
          }
          update_data(filter, updateDoc, productCategorieCollection)
            .then((result) => {
              return res.send({
                success: true,
                status: httpStatus.OK,
                message: "Successfully Get All Categorie",
                data: result,
              });
            })
            .catch((error) => {
              return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
                success: false,
                message: error?.message,
                status: httpStatus.INTERNAL_SERVER_ERROR,
              });
            });
        } catch (error) {
          res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
            success: false,
            message: error?.message,
            status: httpStatus.INTERNAL_SERVER_ERROR,
          });
        }
      }
    );

    // delete categorie
    app.delete("/api/v1/deleteCategorie/:id", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      const { id } = req.params;
      const session = client.startSession();

      try {
        const isAdmin = await usersCollection.findOne(
          { email },
          {
            projection: {
              role: 1,
            },
          }
        );

        if (isAdmin.role !== process.env.IS_USER_ROLE_ADMIN) {
          return res.status(httpStatus.FORBIDDEN).send({
            status: httpStatus.FORBIDDEN,
            message: "You do not have permission to delete categories",
          });
        }

        session.startTransaction();

        const deleteProduct = await productsCollection.deleteMany(
          {
            categorieId: new ObjectId(id),
          },
          { session }
        );

        if (!deleteProduct.deletedCount) {
          throw new Error("Failed to delete associated products");
        }

        const deleteCategorie = await productCategorieCollection.deleteOne(
          { _id: new ObjectId(id) },
          { session }
        );

        if (!deleteCategorie.deletedCount) {
          throw new Error("Failed to delete category");
        }

        await session.commitTransaction();
        await session.endSession();

        return res.send({
          success: true,
          status: httpStatus.OK,
          message: "Product category deleted successfully",
        });
      } catch (error) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        await session.endSession();

        return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
          success: false,
          status: httpStatus.INTERNAL_SERVER_ERROR,
          message: error.message,
        });
      }
    });

    app.get("/api/v1/allproduct", async (req, res) => {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 25;
      const skip = Number((page - 1) * limit);
      const query = paginationQuery(skip, limit);
      const result = await productsCollection.aggregate(query).toArray();

      res.send({
        success: true,
        status: httpStatus.OK,
        message: "Successfully Get All Categorie",
        data: result,
      });
    });

    app.get("/api/v1/specific_product/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      try {
        const result = await productsCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Get Specific Product",
          data: result,
        });
      } catch (error) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: error?.message,
          status: httpStatus.INTERNAL_SERVER_ERROR,
        });
      }
    });

    app.patch(
      `/api/v1/update_product_information/:id`,
      verifyJWT,
      async (req, res) => {
        const { id } = req.params;
        const email = req?.decoded?.email;

        const data = req.body;
        data.categorieId = new ObjectId(data.categorieId);
        const filter = {
          _id: data.categorieId,
        };
        const updateDoc = {
          $set: {
            ...data,
          },
        };
        try {
          const isAdmin = await usersCollection.findOne(
            { email },
            {
              projection: {
                role: 1,
              },
            }
          );
          if (isAdmin.role !== process.env.IS_USER_ROLE_ADMIN) {
            return res.send({
              status: httpStatus.FORBIDDEN,
              message: error?.message,
            });
          }

          // update Product Information
          update_data(filter, updateDoc, productsCollection)
            .then((result) => {
              return res.send({
                success: true,
                status: httpStatus.OK,
                message: "Successfully Get Specific Product",
                data: result,
              });
            })
            .catch((error) => {
              res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
                success: false,
                message: error?.message,
                status: httpStatus.INTERNAL_SERVER_ERROR,
              });
            });
        } catch (error) {
          res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
            success: false,
            message: error?.message,
            status: httpStatus.INTERNAL_SERVER_ERROR,
          });
        }
      }
    );

    app.delete("/api/v1/product/:id", async (req, res) => {
      const { id } = req.params;
      delete_data(id, productsCollection)
        .then((result) => {
          return res.send({
            success: true,
            status: httpStatus.OK,
            message: "Successfully Delete Product",
            data: result,
          });
        })
        .catch((error) => {
          return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
            success: false,
            message: error?.message,
            status: httpStatus.INTERNAL_SERVER_ERROR,
          });
        });
    });

    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    });
    // add to card collection
    app.post("/addToCard", verifyJWT, async (req, res) => {
      const data = req.body;
      const user = req.decoded;
      data.productId = new ObjectId(data.productId);
      const query = {
        productId: data.productId,
        email: user?.email,
      };
      const isAlresyExist = await addToCardCollection
        .findOne(query)
        .then((data) => data?._id);
      if (isAlresyExist) {
        return res.send({
          status: httpStatus.OK,
          message: "This Product Already Exist",
        });
      }

      post_data(addToCardCollection, { ...data, email: user?.email })
        .then((result) => {
          return res.send({
            status: httpStatus.CREATED,
            message: "Add To Card Successfully",
            data: result,
          });
        })
        .catch((error) => {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        });
    });

    // add to card area
    app.get("/api/v1/my_addToCard", verifyJWT, async (req, res) => {
      const email = req.decoded.email;
      const result = await addToCardCollection.find({ email }).toArray();
      res.send({
        status: httpStatus.OK,
        message: "Successfuly Get",
        data: result,
      });
    });

    app.delete("/api/v1/delete_addToCard/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      delete_data(id, addToCardCollection)
        .then((result) => {
          return res.send({
            status: httpStatus.OK,
            message: "Successfully Delete",
            data: result,
          });
        })
        .catch((error) => {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        });
    });

    app.post("/api/v1/add_to_favorite", verifyJWT, async (req, res) => {
      const data = req.body;
      const email = req.decoded.email;
      data.productId = new ObjectId(data.productId);
      const query = {
        productId: data.productId,
        email,
      };
      const isAlredyExist = await favoriteCollection
        .findOne(query)
        .then((data) => data?._id);
      if (isAlredyExist) {
        return res.send({
          status: httpStatus.OK,
          message: "This Product Alredy  Exist",
        });
      }

      post_data(favoriteCollection, { ...data, email })
        .then((result) => {
          return res.send({
            status: httpStatus.OK,
            message: "Successfully Recored",
            data: result,
          });
        })
        .catch((error) => {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        });
    });

    app.get("/api/v1/my_favorite_product", verifyJWT, async (req, res) => {
      const email = req.decoded.email;
      const result = await favoriteCollection.find({ email }).toArray();
      res.send({
        status: httpStatus.OK,
        message: "Successfully Get",
        data: result,
      });
    });

    app.delete(
      "/api/v1/delete_my_favoriteproduct/:id",
      verifyJWT,
      async (req, res) => {
        const { id } = req.params;
        delete_data(id, favoriteCollection)
          .then((result) => {
            return res.send({
              status: httpStatus.OK,
              message: "Delete Successfully",
              data: result,
            });
          })
          .catch((error) => {
            return res.send({
              status: httpStatus.FORBIDDEN,
              message: error?.message,
            });
          });
      }
    );
    // account transaction
    app.post("/api/v1/product_order", verifyJWT, async (req, res) => {
      const { quantities, ...data } = req.body;
      const ProductId = Object.keys(quantities);
      const productQuantity = Object.values(quantities);
      const email = req?.decoded?.email;
      const user = await usersCollection.findOne({ email });
      const paymentStatment = {
        payableAmount: data.total,
        currency: data.currency,
        address: data.address,
        email,
        number: data.number,
        name: user.name,
      };

      const productIds = ProductId.map((v) => new ObjectId(v));
      const query = { _id: { $in: productIds } };
      const items = await addToCardCollection
        .find(query)
        .project({ productId: 1 })
        .toArray();
      const combinedData = items.map((item, index) => {
        return {
          ...item,
          quantity: productQuantity[index],
        };
      });
      const tran_id = new Date().getTime();
      const paymentInfo = paymentGetWay(paymentStatment, tran_id);
      const sslcz = new SSLCommerzPayment(store_id, store_password, is_live);
      const finalOrder = {
        ...paymentStatment,
        combinedData,
        productIds,
        paidStatus: false,
        transactionID: tran_id,
        date: new Date(),
      };

      // transaction Rollback
      const session = client.startSession();

      try {
        session.startTransaction();

        const result = await paymentCollection.insertOne(finalOrder, session);
        if (!result.acknowledged) {
          throw new Error("Failed Payment Information Session");
        }

        for (const item of combinedData) {
          const productId = item.productId;
          const quantity = item.quantity;
          await productsCollection.updateOne(
            { _id: productId },
            { $inc: { available: -quantity } },
            { session }
          );
        }
        await session.commitTransaction();
        await session.endSession();
        sslcz.init(paymentInfo).then((apiResponse) => {
          // Redirect the user to payment gateway
          let GatewayPageURL = apiResponse.GatewayPageURL;

          res.send({ url: GatewayPageURL });
          //  console.log('Redirecting to: ', GatewayPageURL)
        });
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
      }
    });
    app.post("/api/v1/payment/success/:tranId", async (req, res) => {
      const tranId = req.params.tranId;
      const filter = {
        transactionID: Number(tranId),
      };
      const updateDoc = {
        $set: {
          paidStatus: true,
        },
      };

      const session = client.startSession(); // Declare session outside try-catch block
      try {
        session.startTransaction();
        const paymentSuccess = await paymentCollection.updateOne(
          filter,
          updateDoc,
          { session }
        );
        if (paymentSuccess.modifiedCount <= 0) {
          throw new Error("Failed to update Payment Collection");
        }
        // delete addToCard
        const deleteProductIds = await paymentCollection.findOne(filter);

        const result = await addToCardCollection.deleteMany(
          { _id: { $in: deleteProductIds?.productIds } },
          { session }
        );
        if (!(result.acknowledged && result.deletedCount)) {
          throw new Error("Failed Delete AddToCardCollection Session");
        }
        await session.commitTransaction();
        await session.endSession();
        return res.redirect(
          `https://genius-car-doctor.vercel.app/payment/success/${tranId}`
        );
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
      }
    });

    app.post("/api/v1/payment/fail/:tranId", async (req, res) => {
      const tranId = req.params.tranId;

      const filter = {
        transactionID: Number(tranId),
      };

      const { combinedData } = await paymentCollection.findOne(
        { transactionID: Number(tranId) },
        { projection: { combinedData: 1 } }
      );

      // start transaction rollback
      const session = client.startSession();
      try {
        session.startTransaction();
        for (const item of combinedData) {
          const productId = item.productId;
          const quantity = item.quantity;
          await productsCollection.updateOne(
            { _id: productId },
            { $inc: { available: +quantity } },
            { session }
          );
        }
        // second transaction
        const result = await paymentCollection.deleteOne(filter, { session });

        if (!result) {
          throw new Error("Payment Collection Session is Failed");
        }
        await session.commitTransaction();
        await session.endSession();

        return res.redirect(
          `https://genius-car-doctor.vercel.app/payment/fail/${tranId}`
        );
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
      }
    });

    app.post("/api/v1/cancel", async (req, res) => {
      res.redirect(`https://genius-car-doctor.vercel.app/add_to_card`);
    });

    // service controller part started
    app.post("/api/v1/service/payment", verifyJWT, async (req, res) => {
      const serviceData = req.body;
      const tran_id = new Date().getTime();
      const paymentInfo = paymentGetWayService(serviceData, tran_id);
      const sslcz = new SSLCommerzPayment(store_id, store_password, is_live);
      const finalOrder = {
        ...serviceData,
        paidStatus: false,
        transactionID: tran_id,
        date: new Date(),
      };
      // transaction Rollback
      const session = client.startSession();
      try {
        session.startTransaction();

        const result = await servicePaymentCollection.insertOne(finalOrder, {
          session,
        });
        if (!result) {
          throw new Error("Service Payment Collection Session Error");
        }

        const filter = {
          _id: new ObjectId(serviceData?.serviceId),
        };
        const updateDoc = {
          $set: {
            paymentStatus: true,
          },
        };
        const serviceOrder = await orderCollection.updateOne(
          filter,
          updateDoc,
          { upsert: true, session }
        );
        if (!serviceOrder) {
          throw new Error("Order Collection Session Error");
        }
        await session.commitTransaction();
        await session.endSession();
        sslcz.init(paymentInfo).then((apiResponse) => {
          // Redirect the user to payment gateway
          let GatewayPageURL = apiResponse.GatewayPageURL;

          res.send({ url: GatewayPageURL });
          //  console.log('Redirecting to: ', GatewayPageURL)
        });
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
      }
    });

    app.post("/api/v1/payment/service/success/:tranId", async (req, res) => {
      const tranId = req.params.tranId;
      const filter = {
        transactionID: Number(tranId),
      };
      const updateDoc = {
        $set: {
          paidStatus: true,
        },
      };
      const result = await servicePaymentCollection.updateOne(
        filter,
        updateDoc,
        { upsert: true }
      );
      if (!result) {
        throw new Error("Payment Success if Failed");
      }
      res.redirect(
        `https://genius-car-doctor.vercel.app/payment/success/${tranId}`
      );
    });

    app.post("/api/v1/payment/service/fail/:tranId", async (req, res) => {
      const tranId = req.params.tranId;
      const filter = {
        transactionID: Number(tranId),
      };
      // start transaction rollback
      const session = client.startSession();
      try {
        session.startTransaction();

        //second transaction
        const isServiceId = await servicePaymentCollection.findOne(filter);

        const result = await orderCollection.updateOne(
          { _id: new ObjectId(isServiceId.serviceId) },
          {
            $set: {
              paymentStatus: false,
            },
          },
          {
            session,
          }
        );
        if (!result) {
          throw new Error("Payment Failed Session Error");
        }
        const deletePaymentStatment = await servicePaymentCollection.deleteOne(
          filter
        );
        if (!deletePaymentStatment) {
          throw new Error("Payment Failed Session Error");
        }
        await session.commitTransaction();
        await session.endSession();
        return res.redirect(
          `https://genius-car-doctor.vercel.app/payment/fail/${tranId}`
        );
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
      }
    });

    app.post(`/api/v1/service/cancel`, async (req, res) => {
      res.redirect(`https://genius-car-doctor.vercel.app/order`);
    });

    // old product post

    app.post("/api/v1/old_product", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      const data = req.body;
      post_data(oldproductCollection, { ...data, email })
        .then((result) => {
          return res.send({
            status: httpStatus.CREATED,
            message: "Successfully Posted",
            data: result,
          });
        })
        .catch((error) => {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        });
    });

    app.get("/api/v1/all_old_products", async (req, res) => {
      const mergedData = await oldproductCollection
        .aggregate([
          {
            $lookup: {
              from: "user",
              localField: "email",
              foreignField: "email",
              as: "userDetails",
            },
          },
          {
            $unwind: "$userDetails", // Unwind the array to merge user details into the products
          },
          {
            $project: {
              _id: 1,
              type: 1,
              brand: 1,
              model: 1,
              version: 1,
              number: 1,
              year_of_manufacture: 1,
              condition: 1,
              selling_partname: 1,
              engine_capacity: 1,
              price: 1,
              kilometers_driven: 1,
              district: 1,
              actualAddress: 1,
              description: 1,
              photo: 1,
              quantity: 1,
              user_email: "$email",
              user_name: "$userDetails.name",
              user_photo: "$userDetails.photo",
            },
          },
        ])
        .toArray();

      res.send({
        status: httpStatus.OK,
        message: "Successfully Find All Old Products",
        data: mergedData,
      });
    });
    app.get("/api/v1/my_posted_products", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      const result = await oldproductCollection.find({ email }).toArray();
      res.send({
        status: httpStatus.OK,
        message: "Successfully  My Posted Products",
        data: result,
      });
    });
    // delete--- not use
    app.get("/api/v1/delete_my_posted/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      delete_data(id, oldproductCollection)
        .then((result) => {
          return res.send({
            status: httpStatus.OK,
            message: "Successfully  Deleted Post",
            data: result,
          });
        })
        .catch((error) => {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        });
    });

    // add To Card Old Products
    app.post("/api/v1/add_to_card_old_product", verifyJWT, async (req, res) => {
      //oldProductAddToCardCollection
      const data = req.body;
      data.productId = new ObjectId(data.productId);
      const email = req?.decoded?.email;
      const isExistProduct = await oldProductAddToCardCollection.findOne({
        email,
        productId: data.productId,
      });
      if (isExistProduct) {
        return res.send({
          status: httpStatus.OK,
          message: "Alredy Exist",
        });
      }
      const product = {
        ...data,
        email,
      };
      post_data(oldProductAddToCardCollection, product)
        .then((result) => {
          return res.send({
            status: httpStatus.CREATED,
            message: "Successfully Added Product",
            data: result,
          });
        })
        .catch((error) => {});
    });

    // get my old product add to card
    app.get("/api/v1/my_product_addTO_CARD", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;

      const result = await oldProductAddToCardCollection
        .find({ email })
        .toArray();
      res.send({
        status: httpStatus.OK,
        message: "Successfully Find My Add To Card",
        data: result,
      });
    });

    app.post("/api/v1/oldproduct_order", verifyJWT, async (req, res) => {
      const { quantities, ...data } = req.body;
      const ProductId = Object.keys(quantities);
      const productQuantity = Object.values(quantities);
      const email = req?.decoded?.email;
      const user = await usersCollection.findOne({ email });
      const paymentStatment = {
        payableAmount: data.total,
        currency: data.currency,
        address: data.address,
        email,
        number: data.number,
        name: user.name,
      };

      const productIds = ProductId.map((v) => new ObjectId(v));
      const query = { _id: { $in: productIds } };
      const items = await oldProductAddToCardCollection
        .find(query)
        .project({ productId: 1 })
        .toArray();

      const combinedData = items.map((item, index) => {
        return {
          ...item,
          quantity: productQuantity[index],
        };
      });

      const tran_id = new Date().getTime();
      const paymentInfo = paymentGetWayOldProduct(paymentStatment, tran_id);
      const sslcz = new SSLCommerzPayment(store_id, store_password, is_live);

      const finalOrder = {
        ...paymentStatment,
        combinedData,
        productIds,
        paidStatus: false,
        transactionID: tran_id,
        date: new Date(),
      };
      // transaction Rollback

      const session = client.startSession();
      try {
        session.startTransaction();

        const result = await paymentWithOldProductCollection.insertOne(
          finalOrder,
          { session }
        );
        if (!result.acknowledged) {
          throw new Error("Failed Payment Information Session");
        }
        for (const item of combinedData) {
          const productId = item.productId;
          const quantity = item.quantity;
          await oldproductCollection.updateOne(
            { _id: productId },
            { $inc: { quantity: -quantity } },
            { session }
          );
        }

        await session.commitTransaction();
        await session.endSession();
        sslcz.init(paymentInfo).then((apiResponse) => {
          // Redirect the user to payment gateway
          let GatewayPageURL = apiResponse.GatewayPageURL;

          res.send({ url: GatewayPageURL });
          //  console.log('Redirecting to: ', GatewayPageURL)
        });
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
      }
    });

    // add to suucess

    app.post(
      "/api/v1/payment/service/oldsuccess/:tranId",

      async (req, res) => {
        const { tranId } = req.params;
        const filter = {
          transactionID: Number(tranId),
        };

        const updateDoc = {
          $set: {
            paidStatus: true,
          },
        };
        // delete add to card product
        const deleteProductIds = await paymentWithOldProductCollection.findOne(
          filter,
          {
            projection: {
              productIds: 1,
            },
          }
        );

        // started transaction rollback

        const session = client.startSession();

        try {
          session.startTransaction();

          const isPaymentStatusChnage =
            await paymentWithOldProductCollection.updateOne(filter, updateDoc, {
              upsert: true,
            });
          if (!isPaymentStatusChnage) {
            throw new Error("Old Product Payment Session is Failed");
          }

          const result = await oldProductAddToCardCollection.deleteMany(
            { _id: { $in: deleteProductIds?.productIds } },
            { session }
          );
          if (!(result.acknowledged && result.deletedCount)) {
            throw new Error("Failed Delete AddToCardCollection Session");
          }

          await session.commitTransaction();
          await session.endSession();
          return res.redirect(
            `https://genius-car-doctor.vercel.app/payment/success/${tranId}`
          );
        } catch (error) {
          await session.abortTransaction();
          await session.endSession();
        }
      }
    );

    // add to failded message
    app.post("/api/v1/payment/service/oldfail/:tranId", async (req, res) => {
      const tranId = req.params.tranId;

      const filter = {
        transactionID: Number(tranId),
      };
      const { combinedData } = await paymentWithOldProductCollection.findOne(
        { transactionID: Number(tranId) },
        { projection: { combinedData: 1 } }
      );

      // start transaction rollback
      const session = client.startSession();
      try {
        session.startTransaction();
        for (const item of combinedData) {
          const productId = item.productId;
          const quantity = item.quantity;
          await oldproductCollection.updateOne(
            { _id: productId },
            { $inc: { quantity: +quantity } },
            { session }
          );
        }
        // second transaction
        const result = await paymentWithOldProductCollection.deleteOne(filter, {
          session,
        });

        if (!result) {
          throw new Error("Payment Collection Session is Failed");
        }
        await session.commitTransaction();
        await session.endSession();

        return res.redirect(
          `https://genius-car-doctor.vercel.app/payment/fail/${tranId}`
        );
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
      }
    });

    app.post("/api/v1/service/oldcancel", async (req, res) => {
      res.redirect(
        `https://genius-car-doctor.vercel.app/add_to_card/oldProduct`
      );
    });

    app.delete(
      "/api/v1/delete_addToCard_oldProduct/:id",
      verifyJWT,
      async (req, res) => {
        const { id } = req.params;
        delete_data(id, oldProductAddToCardCollection)
          .then((result) => {
            return res.send({
              status: httpStatus.OK,
              message: "Successfully Deleteted",
              data: result,
            });
          })
          .catch((error) => {
            return res.send({
              status: httpStatus.FORBIDDEN,
              message: error?.message,
            });
          });
      }
    );

    app.delete("/api/v1/delete_my_post/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      delete_data(id, oldproductCollection)
        .then((result) => {
          return res.send({
            status: httpStatus.OK,
            message: "Successfully Deleteted",
            data: result,
          });
        })
        .catch((error) => {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        });
    });
    app.get("/api/v1/allOldProducts", async (req, res) => {
      const result = await oldproductCollection.find({}).toArray();

      res.send({
        success: true,
        status: httpStatus.OK,
        message: "Successfully Get All Categorie",
        data: result,
      });
    });

    app.get("/api/v1/allusers", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;

      try {
        const admin = await IsAdmin(email, usersCollection);
        if (!admin) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
        const result = await usersCollection.find({}).toArray();
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Get All Categorie",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });

    app.patch("/api/v1/isAdmin/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      const filter = {
        _id: new ObjectId(id),
      };
      const updateDoc = {
        $set: {
          role: data.isRole,

          createAt: new Date(),
        },
      };
      update_data(filter, updateDoc, usersCollection)
        .then((result) => {
          return res.send({
            success: true,
            status: httpStatus.OK,
            message: "Successfully Get All Categorie",
            data: result,
          });
        })
        .catch((error) => {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        });
    });
    app.get("/api/v1/Admin/AllOrder", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;

      try {
        const admin = await IsAdmin(email, usersCollection);
        if (!admin) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
        const result = await orderCollection.find({}).toArray();
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Get All Order",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });
    app.patch("/api/v1/IsDeliveryDate/:id", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      const { id } = req.params;
      const data = req.body;
      try {
        const admin = await IsAdmin(email, usersCollection);
        if (!admin) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
        //set delivery date
        const filter = {
          _id: new ObjectId(`${id}`),
        };
        const updateDoc = {
          $set: {
            DeliveryDate: data.DeliveryDate,
          },
        };
        update_data(filter, updateDoc, orderCollection)
          .then((result) => {
            return res.send({
              success: true,
              status: httpStatus.OK,
              message: "Successfully Recorded",
              data: result,
            });
          })
          .catch((error) => {
            return res.send({
              status: httpStatus.FORBIDDEN,
              message: error?.message,
            });
          });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });
    app.patch(
      "/api/v1/IsService_IsRecived/:id",
      verifyJWT,
      async (req, res) => {
        const email = req?.decoded?.email;
        const { id } = req.params;
        const data = req.body;
        const filter = { _id: new ObjectId(`${id}`) };
        let updateDoc;
        if (data.received) {
          updateDoc = {
            $set: {
              received: data.received,
            },
          };
        } else {
          updateDoc = {
            $set: {
              isService: data.isService,
            },
          };
        }
        try {
          const admin = await IsAdmin(email, usersCollection);
          if (!admin) {
            res.send({
              status: httpStatus.FORBIDDEN,
              message: error?.message,
            });
          }
          // update status
          update_data(filter, updateDoc, orderCollection)
            .then((result) => {
              return res.send({
                success: true,
                status: httpStatus.OK,
                message: "Successfully Recorded",
                data: result,
              });
            })
            .catch((error) => {
              return res.send({
                status: httpStatus.FORBIDDEN,
                message: error?.message,
              });
            });
        } catch (error) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
      }
    );
    app.get("/api/v1/newproduct_addtocard", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      try {
        const admin = await IsAdmin(email, usersCollection);
        if (!admin) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
        const result = await addToCardCollection.find({}).toArray();
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Recorded",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });
    app.get("/api/v1/all_favorite_product", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      try {
        const admin = await IsAdmin(email, usersCollection);
        if (!admin) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
        const result = await favoriteCollection.find({}).toArray();
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Recorded",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });
    app.get("/api/v1/oldproduct_addtoocard", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      try {
        const admin = await IsAdmin(email, usersCollection);
        if (!admin) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
        const result = await oldProductAddToCardCollection.find({}).toArray();
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Get",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });
    app.get("/api/v1/all_service_payment", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      const { sales } = req.query;
      const admin = await IsAdmin(email, usersCollection);
      if (!admin) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
      const query = ScheduleCalculation(sales);

      try {
        const result = await servicePaymentCollection
          .aggregate([
            {
              $match: {
                date: query,
                paidStatus: true,
              },
            },
          ])
          .toArray();
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Get",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });
    app.get("/api/v1/all_payment_list", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      const { sales } = req.query;
      try {
        const admin = await IsAdmin(email, usersCollection);
        if (!admin) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
        const query = ScheduleCalculation(sales);
        const result = await paymentCollection
          .aggregate([
            {
              $match: {
                date: query,
                paidStatus: true,
              },
            },
          ])
          .toArray();
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Get",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });

    app.get("/api/v1/all_old_paymentList", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      const { sales } = req.query;

      try {
        const admin = await IsAdmin(email, usersCollection);

        if (!admin) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }
        const query = ScheduleCalculation(sales);

        const result = await paymentWithOldProductCollection
          .aggregate([
            {
              $match: {
                date: query,
                paidStatus: true,
              },
            },
          ])
          .toArray();

        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Get",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });
    app.get("/api/v1/my_profile_information", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      try {
        const result = await usersCollection.findOne({ email });
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Get",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });
    app.patch("/api/v1/update_my_profile/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      const filter = {
        _id: new ObjectId(id),
      };
      const updateDoc = {
        $set: {
          ...data,
          createAt: new Date(),
        },
      };
      update_data(filter, updateDoc, usersCollection)
        .then((result) => {
          return res.send({
            success: true,
            status: httpStatus.OK,
            message: "Successfully Update Profile",
            data: result,
          });
        })
        .catch((error) => {
          return res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        });
    });

    app.delete("/api/v1/deleteAccount", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      try {
        const result = await usersCollection.deleteOne({ email });
        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Delete Account",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });

    app.get("/api/v1/dashboard_graph", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;

      try {
        const admin = await IsAdmin(email, usersCollection);

        if (!admin) {
          res.send({
            status: httpStatus.FORBIDDEN,
            message: error?.message,
          });
        }

        const totalUserCount = await usersCollection.estimatedDocumentCount();
        const totalServiceCount =
          await serviceCollection.estimatedDocumentCount();
        const totalOrderCount = await orderCollection.estimatedDocumentCount();
        const totalProductCount =
          await productsCollection.estimatedDocumentCount();
        const totalAdToCardCount =
          await addToCardCollection.estimatedDocumentCount();
        const totalFavoriteCount =
          await favoriteCollection.estimatedDocumentCount();
        const totalOldProductCount =
          await oldproductCollection.estimatedDocumentCount();
        const totalOldProductCardCount =
          await oldProductAddToCardCollection.estimatedDocumentCount();
        const totalCategorieCount =
          await productCategorieCollection.estimatedDocumentCount();
        const serverPayment = await servicePaymentCollection
          .find({})
          .project({
            payableAmount: 1,
            currency: 1,
            name: 1,
          })
          .toArray();
        const newProductPayment = await paymentCollection
          .find({})
          .project({
            payableAmount: 1,
            currency: 1,
            name: 1,
          })
          .toArray();
        const oldProductPayment = await paymentWithOldProductCollection
          .find({})
          .project({
            payableAmount: 1,
            currency: 1,
            name: 1,
          })
          .toArray();
        res.send({
          success: true,

          data: {
            totalUserCount,
            totalServiceCount,
            totalOrderCount,
            totalProductCount,
            totalAdToCardCount,
            totalFavoriteCount,
            totalOldProductCount,
            totalOldProductCardCount,
            totalCategorieCount,
            serverPayment,
            newProductPayment,
            oldProductPayment,
          },
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });

    app.get("/api/v1/admin", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;

      const admin = await IsAdmin(email, usersCollection);
      res.send({ isAdmin: admin === "next" ? true : false });
    });
    app.get("/api/v1/mypayment_laser", verifyJWT, async (req, res) => {
      const email = req?.decoded?.email;
      try {
        const result = await paymentCollection.find({ email }).toArray();

        res.send({
          success: true,
          status: httpStatus.OK,
          message: "Successfully Find My Payment Laser",
          data: result,
        });
      } catch (error) {
        res.send({
          status: httpStatus.FORBIDDEN,
          message: error?.message,
        });
      }
    });

    // started
  } finally {
  }
}

run().catch((err) => console.error(err));

app.get("/", (req, res) => {
  res.send("genius car server is running");
});

app.listen(port, () => {
  console.log(`Genius Car server running on ${port}`);
});
