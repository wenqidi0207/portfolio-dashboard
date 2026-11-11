// Regular weekday session plus five minutes for the closing snapshot.
// Exchange holidays and shortened trading days are not modelled here.
export function getMarketSession(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const minutes = Number(values.hour) * 60 + Number(values.minute);
  const weekday = !['Sat', 'Sun'].includes(values.weekday);
  const open = weekday && minutes >= 570 && minutes <= 965;
  return {
    open,
    closingSnapshot: open && minutes >= 960,
    newYorkTime: `${values.weekday} ${values.hour}:${values.minute}`,
    reason: open ? 'regular session or closing snapshot' : 'outside weekday session'
  };
}
