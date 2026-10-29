import { downloadIcs, googleCalendarUrl } from '../ics.js';
import { Button } from '../ui.jsx';

export default function CalendarButtons({ s }) {
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => downloadIcs(s)} title="Works with Apple, Outlook and Google Calendar">+ Calendar (.ics)</Button>
      <a href={googleCalendarUrl(s)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Google Calendar ↗</Button></a>
    </>
  );
}
