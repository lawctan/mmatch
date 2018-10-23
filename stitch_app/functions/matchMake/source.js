exports = async function(changeEvent) {
 /*
 matchRequest INSERT and UPDATE:
   If timeout changed to true, update(pendingMatch, $remove: {playerList: playerId})
   If new record inserted, check if can combine any matchRequest into a new/existing pendingMatch
 */
  const timedOutChangeToTrue = changeEvent.operationType === "update" 
    && changeEvent.updateDescription.updatedFields.timedOut != undefined
    && changeEvent.updateDescription.updatedFields.timedOut === true;
  const newMatchRequest = changeEvent.operationType === "insert" || (changeEvent.operationType === "update" && changeEvent.updateDescription.updatedFields.expiresAt != undefined);
 
 if (timedOutChangeToTrue) {
   // get playerId from changed matchRequest doc
   var playerId = changeEvent.fullDocument.playerId;
   
   var collection = context.services.get("mongodb-atlas").db("core").collection("pendingMatches");
   var result = await collection.updateOne({"playerList._id": playerId}, {$pull: {playerList: {'_id':playerId}}});
   console.log("player " + playerId + " removed from " + result.modifiedCount + " match(es)");
   
   // clean up the pendingMatches that have an empty playerList
   result = await collection.deleteMany({playerList: []})
   console.log("cleaned up " + result.deletedCount + " pending matches")
 } else if (newMatchRequest) {
   
   // figure out if we can add to an existing pendingMatches doc, or whether a new one needs to be added (based on player skill)
     
   var db = context.services.get("mongodb-atlas").db("core");
   
   // get the playerId from the new matchRequest
   var playerId = changeEvent.fullDocument.playerId;
   console.log("playerId: " + playerId);
   var playerToMatch = await db.collection("players").findOne({_id: playerId});
   console.log("playerToMatch: " + JSON.stringify(playerToMatch));
   
   // for each pendingMatch, see if the player for the matchRequest can be matched
   var pendingMatches = await db.collection("pendingMatches").find({}).toArray();
   
   var matchFound = false;
   for (var i = 0; i < pendingMatches.length && !matchFound; i++) {
     var playersMatched = [];
     var totalMatchSkill = 0;
     for (var j = 0; j < pendingMatches[i].playerList.length; j++) {
       var player = pendingMatches[i].playerList[j];
       console.log("assessing player " + player._id)
       totalMatchSkill += player.skillLevel;
       playersMatched.push(player._id);
     }
     
     var averageMatchSkill = totalMatchSkill / pendingMatches[i].playerList.length;
     if (playerToMatch.skillLevel >= averageMatchSkill - 5 && playerToMatch.skillLevel <= averageMatchSkill + 5) {
       // found a match!
       matchFound = true;
       
       // push the player into the matched game
       var result = await db.collection("pendingMatches").updateOne({_id: pendingMatches[i]._id}, {$push: {playerList: playerToMatch}});
       if (result.matchedCount != 1) {
         throw "unable to add player to pending match!";
       }
       
       var updatedPendingMatch = await db.collection("pendingMatches").findOne({_id: pendingMatches[i]._id});
       // check if we now have full match (assuming 4 players needing to start a game)
       if (updatedPendingMatch.playerList.length == 4) {
         // update the match id of all matchRequests involved and delete the pendingMatch doc
         console.log("playersMatched: " + playersMatched)
         playersMatched.push(playerId);
         var result = await db.collection("matchRequests").updateMany({playerId: {$in: playersMatched}}, {$set: {matchId: pendingMatches[i]._id}});
         console.log("updated " + result.modifiedCount + " matchRequests with a matchId! (" + pendingMatches[i]._id + ")");
         
         await db.collection("pendingMatches").deleteOne({_id: pendingMatches[i]._id});
         // can stop here
         break;
       }
     }
   }
   
   if (!matchFound) {
     // need to create a new pendingMatch with just this player
     await db.collection("pendingMatches").insertOne({playerList: [playerToMatch]});
   }
 }
};