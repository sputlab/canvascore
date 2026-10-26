// The texts drag and drop reads out to screen readers (the library's own are English)
import { __ } from './index.js';

export const dndAccessibility = {
  screenReaderInstructions: {
    draggable: __("To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item. Press space again to drop the item in its new position, or press escape to cancel."),
  },
  announcements: {
    onDragStart: ({ active }) => __("Picked up the item {0}.", active.id),
    onDragOver: ({ active, over }) => (over ? __("The item {0} was moved over {1}.", active.id, over.id) : __("The item {0} is no longer over a place where it can be dropped.", active.id)),
    onDragEnd: ({ active, over }) => (over ? __("The item {0} was dropped over {1}.", active.id, over.id) : __("The item {0} was dropped.", active.id)),
    onDragCancel: ({ active }) => __("Moving was cancelled. The item {0} was dropped.", active.id),
  },
};
