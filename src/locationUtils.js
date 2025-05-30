export function initializeLocationTracking(map, refs, lat, lng, accuracy) {
    updateLocation(map, refs, lat, lng, accuracy, true);

    const watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            refs.current.lastLocationRef = { lat: latitude, lng: longitude };
            updateLocation(map, refs, latitude, longitude, accuracy, false);
        },
        (err) => {
            alert('위치 추적 실패');
            console.error(err);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 10000,
        }
    );

    refs.current.watchIdRef = watchId;
}

function updateLocation(map, refs, lat, lng, accuracy, moveCenter) {
    const kakao = window.kakao;
    const latlng = new kakao.maps.LatLng(lat, lng);

    if (moveCenter) map.setCenter(latlng);

    if (refs.current.circleRef) refs.current.circleRef.setMap(null);
    const circle = new kakao.maps.Circle({
        center: latlng,
        radius: accuracy,
        strokeWeight: 1,
        strokeColor: '#00f',
        strokeOpacity: 0.8,
        fillColor: '#00f',
        fillOpacity: 0.2,
    });
    circle.setMap(map);
    refs.current.circleRef = circle;

    if (refs.current.overlayRef) refs.current.overlayRef.setMap(null);
    const content = `
    <div style="
      width: 14px;
      height: 14px;
      background: #00f;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 6px rgba(0,0,255,0.6);
    "></div>
  `;
    const overlay = new kakao.maps.CustomOverlay({
        position: latlng,
        content,
        yAnchor: 0.5,
        xAnchor: 0.5,
    });
    overlay.setMap(map);
    refs.current.overlayRef = overlay;
}

export function recenterToMyLocation(mapRef, refs) {
    const loc = refs.current.lastLocationRef;
    if (loc && mapRef.current) {
        const latlng = new window.kakao.maps.LatLng(loc.lat, loc.lng);
        mapRef.current.setCenter(latlng);
    } else {
        alert('현재 위치를 아직 가져오지 못했어요.');
    }
}
