import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaLocationCrosshairs } from "react-icons/fa6";

const App = () => {
    const mapRef = useRef(null);
    const circleRef = useRef(null);
    const overlayRef = useRef(null);
    const lastLocationRef = useRef(null);
    const watchIdRef = useRef(null);
    const polylineRef = useRef(null);

    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (window.kakao && window.kakao.maps) {
            const kakao = window.kakao;
            kakao.maps.load(() => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude, accuracy } = position.coords;
                        const latlng = new kakao.maps.LatLng(latitude, longitude);

                        const container = document.getElementById('map');
                        const options = {
                            center: latlng,
                            level: 3,
                        };

                        const map = new kakao.maps.Map(container, options);
                        mapRef.current = map;

                        const mapTypeControl = new kakao.maps.MapTypeControl();
                        map.addControl(mapTypeControl, kakao.maps.ControlPosition.TOPRIGHT);

                        const zoomControl = new kakao.maps.ZoomControl();
                        map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

                        setLoaded(true);
                        updateLocation(latitude, longitude, accuracy, true);

                        const watchId = navigator.geolocation.watchPosition(
                            (pos) => {
                                const { latitude, longitude, accuracy } = pos.coords;
                                lastLocationRef.current = { lat: latitude, lng: longitude };
                                updateLocation(latitude, longitude, accuracy, false); // 중심이동 X
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
                        watchIdRef.current = watchId;

                        // 횡단보도 데이터 가져오기
                        fetchCrosswalkData(kakao, map);
                    },
                    (err) => {
                        alert('현재 위치를 가져올 수 없습니다.');
                        console.error(err);
                    }
                );
            });
        }

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    const updateLocation = (lat, lng, accuracy, moveCenter) => {
        if (!mapRef.current) return;

        const kakao = window.kakao;
        const latlng = new kakao.maps.LatLng(lat, lng);

        if (moveCenter) {
            mapRef.current.setCenter(latlng);
        }

        if (circleRef.current) circleRef.current.setMap(null);
        const circle = new kakao.maps.Circle({
            center: latlng,
            radius: accuracy,
            strokeWeight: 1,
            strokeColor: '#00f',
            strokeOpacity: 0.8,
            fillColor: '#00f',
            fillOpacity: 0.2,
        });
        circle.setMap(mapRef.current);
        circleRef.current = circle;

        if (overlayRef.current) overlayRef.current.setMap(null);
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
        overlay.setMap(mapRef.current);
        overlayRef.current = overlay;
    };

    const recenterToMyLocation = () => {
        const loc = lastLocationRef.current;
        if (loc && mapRef.current) {
            const latlng = new window.kakao.maps.LatLng(loc.lat, loc.lng);
            mapRef.current.setCenter(latlng);
        } else {
            alert('현재 위치를 아직 가져오지 못했어요.');
        }
    };

    const fetchCrosswalkData = async (kakao, map) => {
        try {
            const serviceKey = import.meta.env.VITE_SAFEMAP_API_KEY;
            const url = `https://safemap.go.kr/openApiService/data/getRblng3Data.do?serviceKey=${serviceKey}&pageNo=1&numOfRows=1000&dataType=json`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.response?.body?.items?.item) {
                const items = data.response.body.items.item;

                // 좌표 배열 생성
                const path = items
                    .map((item) => {
                        const lat = parseFloat(item.LAT);
                        const lng = parseFloat(item.LNG);
                        if (!isNaN(lat) && !isNaN(lng)) {
                            return new kakao.maps.LatLng(lat, lng);
                        }
                        return null;
                    })
                    .filter((point) => point !== null);

                // 중복 제거
                const uniquePath = Array.from(
                    new Set(path.map((p) => `${p.getLat()},${p.getLng()}`))
                ).map((str) => {
                    const [lat, lng] = str.split(',').map(Number);
                    return new kakao.maps.LatLng(lat, lng);
                });

                // 정렬 (예: 위도 기준)
                uniquePath.sort((a, b) => a.getLat() - b.getLat());

                // 기존 폴리라인 제거
                if (polylineRef.current) {
                    polylineRef.current.setMap(null);
                }

                // 폴리라인 생성
                const polyline = new kakao.maps.Polyline({
                    path: uniquePath,
                    strokeWeight: 3,
                    strokeColor: '#FF0000',
                    strokeOpacity: 0.7,
                    strokeStyle: 'solid',
                });

                polyline.setMap(map);
                polylineRef.current = polyline;
            }
        } catch (error) {
            console.error('횡단보도 데이터 가져오기 실패:', error);
        }
    };

    return (
        <Container>
            <Map id="map" />
            {loaded && (
                <LocateButton onClick={recenterToMyLocation}>
                    <FaLocationCrosshairs />
                </LocateButton>
            )}
        </Container>
    );
};

const Container = styled.div`
    width: 100%;
    height: 100vh;
    position: relative;
`;

const Map = styled.div`
    width: 100%;
    height: 100%;
`;

const LocateButton = styled.button`
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: white;
    border: none;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    font-size: 24px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    z-index: 10;

    &:hover {
        background: #f0f0f0;
    }
`;

export default App;
