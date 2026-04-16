import { ensureAuth } from "./auth";

/**
 * Creates an event in the specified Google Calendar with a Meet link.
 * Returns the hangoutLink and the eventId.
 */
export async function createMeetConference(calendarId: string, eventData: {
    title: string;
    description?: string;
    startAt: string; // ISO
    endAt: string;   // ISO
}) {
    await ensureAuth();
    const gapi = (window as any).gapi;

    if (!gapi.client.calendar) {
        throw new Error("Google Calendar API not loaded");
    }

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

    const response = await gapi.client.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        conferenceDataVersion: 1,
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
