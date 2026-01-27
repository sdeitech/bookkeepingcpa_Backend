/* Controller import starts */
const zapierJobCntrl = require("../controllers/zapierController");
/* Controller import ends */

const bodyParser = require("body-parser");

module.exports = function (app) {
  const jsonParser = bodyParser.json();

  // Create Zapier Job
  app.post(
    "/api/zapier/job",
    jsonParser,
    zapierJobCntrl.createZapierJob
  );

  // Zapier status callback
  app.post(
    "/api/zapier/status",
    jsonParser,
    zapierJobCntrl.zapierStatusCallback
  );

  // Get job status
  app.get(
    "/api/zapier/job/:requestId",
    zapierJobCntrl.getZapierJobStatus
  );
};
