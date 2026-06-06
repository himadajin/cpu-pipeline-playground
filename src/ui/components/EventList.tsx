import clsx from "clsx";
import type { PipelineEvent } from "../../core";

export function EventList({ events, emptyText }: { events: PipelineEvent[]; emptyText: string }) {
  return (
    <div className="event-list">
      {events.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        events.map((event) => (
          <div className={clsx("event-detail", event.kind)} key={event.id}>
            <strong>{event.label}</strong>
            <span>{event.message}</span>
          </div>
        ))
      )}
    </div>
  );
}
