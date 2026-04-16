import { ensureAuth } from "./auth";

const CALENDAR_DISCOVERY_URL = "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";

/**
 * Ensures the Calendar API is loaded. This handles the case where
 * initGoogleClient skipped it because Drive was already available.
 */
async function ensureCalendarApi(): Promise<void> {
    const gapi = (window as any).gapi;
    if (!gapi?.client) throw new Error("Google client not initialized");

    if (!gapi.client.calendar) {
        try {
            await gapi.client.load(CALENDAR_DISCOVERY_URL);
        } catch (e) {
            throw new Error("No se pudo cargar la API de Google Calendar. Verifica que esté habilitada en tu proyecto de Google Cloud.");
        }
    }
}

/**
 * Creates an event in the specified Google Calendar with a Meet link.
 * Returns the hangoutLink and the eventId.
 */
export async function createMeetConference(calendarId: string, eventData: {
    title: string;
    description?: string;
    startAt: string; // ISO
    endAt: string;   // ISO
    attendees?: string[];
}) {
    await ensureAuth();
    await ensureCalendarApi();
    const gapi = (window as any).gapi;

    const event: any = {
        summary: eventData.title,
        description: eventData.description,
        start: {
            dateTime: eventData.startAt,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
            dateTime: eventData.endAt,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        conferenceData: {
            createRequest: {
                requestId: `nexus-${Date.now()}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
        },
    };

    // Add attendees if provided
    if (eventData.attendees && eventData.attendees.length > 0) {
        event.attendees = eventData.attendees.map(email => ({ email: email.trim() }));
    }

    const response = await gapi.client.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: eventData.attendees && eventData.attendees.length > 0 ? 'all' : 'none',
    });

    return {
        id: response.result.id,
        hangoutLink: response.result.hangoutLink,
        htmlLink: response.result.htmlLink,
    };
}

/**
 * Updates an existing Google Calendar event.
 */
export async function updateMeetConference(calendarId: string, gcalEventId: string, eventData: {
    title: string;
    description?: string;
    startAt: string;
    endAt: string;
}) {
    await ensureAuth();
    const gapi = (window as any).gapi;

    const event: any = {
        summary: eventData.title,
        description: eventData.description,
        start: {
            dateTime: eventData.startAt,
        },
        end: {
            dateTime: eventData.endAt,
        },
    };

    const response = await gapi.client.calendar.events.patch({
        calendarId: calendarId,
        eventId: gcalEventId,
        resource: event,
    });

    return response.result;
}
