exports = async function(playerId){

  const TIMEOUT = 40000;
  var now = new Date();
  var expiresAt = new Date(now.getTime() + TIMEOUT);
  const db = context.services.get("mongodb-atlas").db("core");

  var playerDoc = await db.collection("players").findOne({"_id": playerId});
  if (playerDoc === undefined) {
    throw "Player doesn't exist"
  }

  var matchRequests = db.collection("matchRequests");
  var doc = await matchRequests.updateOne(
    {"playerId": playerId}, 
    {$set: {"playerId": playerId, "expiresAt": expiresAt, "timedOut": false, "matchId": null}},
    {upsert: true});

  return doc.insertedId;
};