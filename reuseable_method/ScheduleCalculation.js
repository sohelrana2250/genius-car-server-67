const ScheduleCalculation = (sales) => {
  let query;
  switch (sales) {
    case "daily":
      {
        query = {
          $gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
        };
      }
      break;
    case "weekly":
      {
        query = {
          $gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
        };
      }
      break;
    case "monthly":
      {
        const date = new Date();
        const firstDayOfMonth = new Date(
          date.getFullYear(),
          date.getMonth(),
          1
        );
        const lastDayOfMonth = new Date(
          date.getFullYear(),
          date.getMonth() + 1,
          0
        );
        query = {
          $gte: firstDayOfMonth, // Sales on or after the first day of the current month
          $lte: lastDayOfMonth,
        };
      }
      break;
    case "yearly":
      {
        query = {
          $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
        };
      }
      break;
    default: {
      query = {
        $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 3)),
      };
    }
  }
  return query;
};
module.exports = ScheduleCalculation;
