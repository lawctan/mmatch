exports = async function(reqBody){
  const playerId = reqBody.playerId;
  const mongodb = context.services.get("mongodb-atlas");
  const matchRequests = mongodb.db("core").collection("matchRequests");

  // Read data from a collection
  const matchRequest = await matchRequests.findOne({ "playerId": playerId });
  if (matchRequest === undefined) {
    return {status:"failed"}
  }

  const expiresAt = matchRequest.expiresAt;
  if (new Date() > expiresAt) {
     await matchRequests.updateOne({ playerId: playerId }, {$set: {timedOut: true}});
     return {status:"failed"}
  }
  
  if ('matchId' in matchRequest) {
    if (matchRequest.matchId === null) {
      return {status:"waiting"}
    } else {
      return {status:"ok", matchId: matchRequest.matchId}
    }
  }
  return {status:"failed"}
};