import axios from 'axios';
import osmtogeojson from 'osmtogeojson';

export const fetchOverpassData = async (query) => {
    try {
        const response = await axios.post(
            'https://overpass-api.de/api/interpreter',
            `data=${encodeURIComponent(query)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('[Overpass] API 호출 실패:', error);
        return null;
    }
};

export const drawParkingAllowedZone = async (map) => {
    const center = map.getCenter();
    console.log('[Parking Zone] 요청 시작 위치:', center.getLat(), center.getLng());

    const bbox = [
        center.getLat() - 0.01,
        center.getLng() - 0.01,
        center.getLat() + 0.01,
        center.getLng() + 0.01
    ];
    console.log('[Query 생성] bbox:', bbox.join(','));

    const query = `
    [out:json][timeout:25];
    (
      way["highway"~"residential|service|unclassified|tertiary|secondary|primary|living_street"](${bbox.join(',')});
      way["landuse"~"retail|commercial|grass|pavement|recreation_ground"](${bbox.join(',')});
      way["amenity"~"parking|bicycle_parking|marketplace"](${bbox.join(',')});
    );
    out body;
    >;
    out skel qt;
  `;
    console.log('[Query 생성 완료] query:', query);

    const data = await fetchOverpassData(query);
    if (!data || !data.elements || data.elements.length === 0) {
        console.log('[Parking Zone] 유효한 영역 없음');
        return;
    }

    const geojson = osmtogeojson(data);
    geojson.features.forEach((feature) => {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
            const path = feature.geometry.coordinates[0].map((coord) => new window.kakao.maps.LatLng(coord[1], coord[0]));
            const polygon = new window.kakao.maps.Polygon({
                path,
                strokeWeight: 2,
                strokeColor: '#00AA88',
                strokeOpacity: 0.8,
                fillColor: '#00AA8844',
                fillOpacity: 0.5
            });
            polygon.setMap(map);
        }
    });
};

// ▼ 정제 및 시각화용
export const drawPredefinedParkingLots = (map, seoulData, gyeonggiData) => {
    if (!Array.isArray(seoulData?.DATA) || !Array.isArray(gyeonggiData)) return;

    // 서울시 데이터 → 주소 기반 Geocoding
    seoulData.DATA.forEach(async (item) => {
        const fullAddress = `${item.sgg_nm} ${item.pstn} ${item.dtl_pstn}`;
        try {
            const res = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
                params: { query: fullAddress },
                headers: { Authorization: `KakaoAK ${import.meta.env.VITE_KAKAO_REST_API_KEY}` }
            });
            const doc = res.data.documents[0];
            if (doc) {
                const lat = parseFloat(doc.y);
                const lng = parseFloat(doc.x);
                new window.kakao.maps.Marker({
                    position: new window.kakao.maps.LatLng(lat, lng),
                    map,
                    title: '서울시 주차 구역'
                });
            }
        } catch (e) {
            console.warn(`[Geocode 오류] ${fullAddress}`);
        }
    });

    // 경기도 데이터 → 위경도 기반 바로 마커 생성
    gyeonggiData.forEach((item) => {
        const lat = parseFloat(item.REFINE_WGS84_LAT);
        const lng = parseFloat(item.REFINE_WGS84_LOGT);
        if (!isNaN(lat) && !isNaN(lng)) {
            new window.kakao.maps.Marker({
                position: new window.kakao.maps.LatLng(lat, lng),
                map,
                title: '경기도 주차 구역'
            });
        }
    });
};
