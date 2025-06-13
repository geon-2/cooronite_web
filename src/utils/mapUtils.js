import axios from 'axios';
import osmtogeojson from 'osmtogeojson';

// ========== 기존 주차 구역 관련 함수들 ==========

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
            console.error(e);
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

// ========== 🚫 주차금지구역 오버레이 기능 (고정덮개 + 움직이는 구멍) ==========

// 전역 변수로 관리
let fixedOverlay = null; // 고정된 전체 덮개
let holePolygons = []; // 움직이는 구멍들

/**
 * 주차금지구역 오버레이 생성 (고정된 전체 덮개 + 움직이는 구멍)
 */
export const drawParkingProhibitionOverlay = async (map) => {
    if (!map) return;

    // 1. 고정된 전체 화면 덮개 생성 (최초 1회만)
    createFixedFullScreenOverlay(map);

    // 2. 현재 화면의 주차 가능 구역 구멍들 생성
    await updateParkingHoles(map);
};

/**
 * 고정된 전체 화면 덮개 생성 (화면 전체를 항상 덮음)
 */
const createFixedFullScreenOverlay = (map) => {
    // 이미 생성되어 있으면 스킵
    if (fixedOverlay) {
        console.log('[고정 덮개] 이미 존재함 - 생략');
        return;
    }

    // 지도 전체를 덮는 매우 큰 사각형 (전 세계를 덮을 정도로)
    const globalBounds = [
        new window.kakao.maps.LatLng(-85, -180), // 남서 (남극 근처)
        new window.kakao.maps.LatLng(-85, 180),  // 남동
        new window.kakao.maps.LatLng(85, 180),   // 북동 (북극 근처)
        new window.kakao.maps.LatLng(85, -180),  // 북서
        new window.kakao.maps.LatLng(-85, -180)  // 닫기
    ];

    fixedOverlay = new window.kakao.maps.Polygon({
        path: globalBounds,
        strokeWeight: 0,
        fillColor: '#808080',
        fillOpacity: 0.6,
        zIndex: 1 // 구멍들보다 아래에
    });

    fixedOverlay.setMap(map);
    console.log('[고정 덮개] 전 세계 덮개 생성 완료');
};

/**
 * 현재 화면의 주차 가능 구역에 구멍 생성/업데이트
 */
const updateParkingHoles = async (map) => {
    // 기존 구멍들 제거
    clearParkingHoles();

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    // 현재 화면 + 약간의 여유분에서 주차 가능 구역 검색
    const searchBbox = [
        sw.getLat() - 0.005,
        sw.getLng() - 0.005,
        ne.getLat() + 0.005,
        ne.getLng() + 0.005
    ];

    try {
        const allowedZones = await fetchParkingAllowedZones(searchBbox);
        console.log(`[구멍 업데이트] ${allowedZones.length}개 주차 가능 구역 발견`);

        // 각 주차 가능 구역을 흰색 폴리곤으로 생성 (구멍 효과)
        allowedZones.forEach((zone, index) => {
            try {
                if (zone.length < 3) return;

                const holePath = zone.map(coord =>
                    new window.kakao.maps.LatLng(coord[1], coord[0])
                );

                // 흰색 폴리곤으로 구멍 효과 생성
                const holePolygon = new window.kakao.maps.Polygon({
                    path: holePath,
                    strokeWeight: 1,
                    strokeColor: '#00AA88',
                    strokeOpacity: 0.8,
                    fillColor: '#FFFFFF', // 흰색으로 덮개를 덮어씀
                    fillOpacity: 1.0,     // 완전 불투명
                    zIndex: 2 // 고정 덮개보다 위에
                });

                holePolygon.setMap(map);
                holePolygons.push(holePolygon);

            } catch (error) {
                console.warn(`[구멍 ${index}] 생성 실패:`, error);
            }
        });

        console.log(`[구멍 업데이트] ${holePolygons.length}개 구멍 생성 완료`);

    } catch (error) {
        console.error('[구멍 업데이트] 실패:', error);
    }
};

/**
 * 주차 가능 구역 데이터 가져오기
 */
const fetchParkingAllowedZones = async (bbox) => {
    const query = `
    [out:json][timeout:20];
    (
      way["highway"~"residential|service|unclassified|tertiary|secondary|primary|living_street"](${bbox.join(',')});
      way["landuse"~"retail|commercial|grass|pavement"](${bbox.join(',')});
      way["amenity"~"parking|bicycle_parking"](${bbox.join(',')});
    );
    out body;
    >;
    out skel qt;
    `;

    try {
        const data = await fetchOverpassData(query);
        if (!data || !data.elements) return [];

        const geojson = osmtogeojson(data);
        const zones = [];

        geojson.features.forEach((feature) => {
            if (feature.geometry.type === 'Polygon') {
                zones.push(feature.geometry.coordinates[0]);
            } else if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(polygon => {
                    zones.push(polygon[0]);
                });
            }
        });

        console.log(`[주차 가능 구역] ${zones.length}개 발견`);
        return zones;
    } catch (error) {
        console.error('[주차 가능 구역] 데이터 가져오기 실패:', error);
        return [];
    }
};

/**
 * 기존 구멍들만 제거 (고정 덮개는 유지)
 */
const clearParkingHoles = () => {
    holePolygons.forEach(polygon => {
        if (polygon && polygon.setMap) {
            polygon.setMap(null);
        }
    });
    holePolygons = [];
    console.log('[구멍 제거] 기존 구멍들 제거 완료');
};

/**
 * 주차 가능 구역 구멍만 업데이트 (지도 이동 시 호출)
 */
export const updateParkingProhibitionHoles = async (map) => {
    if (!fixedOverlay) return; // 고정 덮개가 없으면 스킵

    console.log('[구멍 업데이트] 지도 이동으로 인한 구멍 업데이트');
    await updateParkingHoles(map);
};

/**
 * 주차금지 오버레이 완전 제거
 */
export const clearParkingProhibitionOverlay = () => {
    // 고정 덮개 제거
    if (fixedOverlay) {
        fixedOverlay.setMap(null);
        fixedOverlay = null;
    }

    // 구멍들 제거
    clearParkingHoles();

    console.log('[주차금지구역] 고정 덮개 + 모든 구멍 제거 완료');
};