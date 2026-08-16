/* eslint-disable @typescript-eslint/no-explicit-any */
import 'leaflet';

// Extend L namespace for divIcon usage
declare module 'leaflet' {
  namespace L {
    function divIcon(options: any): L.DivIcon;
  }
}
