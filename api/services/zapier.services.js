const axios = require("axios");


const sendToZapier = async (payload) => {
  return axios.post(process.env.ZAPIER_WEBHOOK_URL, payload, {
    headers: {
      "Content-Type": "application/json",
    },
  });
};

module.exports = {
  sendToZapier,
};
