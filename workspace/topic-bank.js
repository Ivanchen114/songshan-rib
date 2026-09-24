import {W5_TOPICS,w5Topic} from './w5-topics.js';
import {W7_TOPICS,w7Topic} from './w7-topics.js';
export const ALL_TOPICS=[...W5_TOPICS,...W7_TOPICS];
export const topicById=id=>w5Topic(id)||w7Topic(id);
