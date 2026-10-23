// Central icon registry.
//
// All `react-icons/md` symbols used anywhere in the app are re-exported from
// this single file. Two reasons:
//
//  1. **One import path.** Every consumer writes
//     `import { MdCheck } from "<...>/icons";` regardless of where the icon
//     came from originally. No more guessing whether it lives in `/md`,
//     `/fa`, `/io`, etc.
//
//  2. **One place to swap the icon set.** If we ever migrate away from
//     `react-icons` (e.g., to Lucide), only this file changes \u2014 every call
//     site keeps working.
//
// Keep the groupings below in alphabetical order within each group so this
// file stays scannable as the icon list grows.

export {
  // ===== Navigation / chrome =============================
  MdDevices,
  MdPendingActions,
  MdRoute,
  MdSettings,
  MdArrowBack,
  MdMedicalServices,
  MdInfoOutline,
  MdTune,
  MdSmartToy,

  // ===== Status / connectivity ===========================
  MdWifi,
  MdWifiOff,
  MdCloudOff,
  MdNotifications,
  MdHourglassEmpty,
  MdAccessTime,
  MdCheckCircle,
  MdCancel,
  MdError,
  MdLinkOff,

  // ===== Generic actions =================================
  MdAdd,
  MdEdit,
  MdDelete,
  MdSave,
  MdClose,
  MdCheck,
  MdRemoveCircleOutline,
  MdAssignment,
  MdKeyboardArrowDown,
  MdArrowDownward,

  // ===== Workflow / location =============================
  MdLocationOn,
  MdMyLocation,
  MdFlag,
  MdMap,
  MdDirectionsRun,
  MdDirectionsWalk,
  MdFactCheck,
  MdMovie,
} from "react-icons/md";
