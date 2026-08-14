import 'leaflet';

// Extend L namespace for divIcon usage
declare module 'leaflet' {
  namespace L {
    function divIcon(options: any): L.DivIcon;
  }
}
