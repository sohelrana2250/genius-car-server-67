const moment = require("moment");
const { createServiceContent } = require("../auth/emailData");
const { sendEmail } = require("../auth/sendEmail");
const PaymentSuccessStatsus = async (paymentCollection) => {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const paymentFailed = await paymentCollection
    .find({
      date: { $lte: thirtyMinAgo },
      paidStatus: false,
    })
    .project({ _id: 1 })
    .toArray();
  const idsToDelete = paymentFailed?.map((id) => id._id);
  if (idsToDelete?.length > 0) {
    await paymentCollection.deleteMany({
      _id: { $in: idsToDelete },
    });
  }
};
// if today done with service after 3 month send automatically email for the Aagain Servicing
const scheduleEmails = async (orderCollection) => {
  const collectedData = await orderCollection
    .find({ isService: true, received: true, paymentStatus: true })
    .project({
      serviceName: 1,
      registerNumber: 1,
      email: 1,
      DeliveryDate: 1,
    })
    .toArray();

  collectedData.forEach((v) => {
    const date = new Date(v.DeliveryDate);
    const serviceDate = moment(date);
    const sendingDate = serviceDate.add(3, "months");
    const currentDate = moment();

    if (currentDate.isSame(sendingDate, "day")) {
      const emaildata = createServiceContent({
        serviceName: v?.serviceName,
        serviceingDate: v?.DeliveryDate,
        registerNumber: v?.registerNumber,
      });
      try {
        sendEmail(v?.email, emaildata.email_body, emaildata.subject);
      } catch (err) {
        console.log(err?.message);
      }
    }
  });
};
module.exports = {
  PaymentSuccessStatsus,
  scheduleEmails,
};
