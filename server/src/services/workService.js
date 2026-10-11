import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import CatchModel from '../models/Catch.js';
import Session from '../models/Session.js';
import Snapshot from '../models/Snapshot.js';
import Milestone from '../models/Milestone.js';

export async function deleteWorkCascade(workId) {
  await Promise.all([
    Chapter.deleteMany({ workId }),
    Codex.deleteMany({ workId }),
    MapModel.deleteMany({ workId }),
    CatchModel.deleteMany({ workId }),
    Session.deleteMany({ workId }),
    Snapshot.deleteMany({ workId }),
    Milestone.deleteMany({ workId }),
  ]);
}
