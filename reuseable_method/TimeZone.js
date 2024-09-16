// Create a new Date object representing the current date and time
const TimeZone=()=>{
    const today = new Date();

    // Convert UTC to Bangladesh time
    today.setUTCHours(today.getUTCHours() + 6);
    today.setUTCMinutes(0);
    today.setUTCSeconds(0);
    today.setUTCMilliseconds(0);
    
    return today;
}

module.exports={
    TimeZone
}