const createServiceContent = (emailcontent) => {
  return {
    email_body: `
      <h3>Dear Sir/Madam</h3>
      <div>
         <p> We hope you’re enjoying a smooth ride after your recent car servicing on ${emailcontent.serviceingDate}.<p/>
         <p> As it's been three months, we wanted to check in and ensure that your vehicle is still performing at its best. Regular maintenance is key to keeping your car in top condition, so if you have any concerns or if it's time for another service, please don't hesitate to contact us.
          We also recommend checking the following at this time:
          - ${emailcontent.serviceName}
          - Car Number is : ${emailcontent.registerNumber}
          Thank you for trusting us with your vehicle. We’re here to assist with any of your automotive needs.</p>
          Best Regards,
         <p>Car Doctors</p>
         <p>Our Head office Mohammadpur 1273/1 Block A</p>
      </div>
      `,
    subject: "3-Month After Service Follow-Up ",
  };
};

module.exports = {
  createServiceContent,
};
