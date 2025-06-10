import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaLocationCrosshairs } from 'react-icons/fa6';
import { initializeLocationTracking, recenterToMyLocation } from '../utils/locationUtils';

const Location = () => {
    const mapRef = useRef(null);
    const refs = useRef({
        overlayRef: null,
        circleRef: null,
        watchIdRef: null,
        lastLocationRef: null
    });
    const [loaded, setLoaded] = useState(false);

    // 좌표를 주소로 변환하는 함수
    const getAddressFromCoords = (latitude, longitude) => {
        // REST API를 사용한 주소 변환 (services 의존성 없이)
        const REST_API_KEY = import.meta.env.VITE_KAKAO_API_KEY;

        if (!REST_API_KEY) {
            console.error('Kakao REST API Key not found');
            // API 키가 없어도 좌표는 전송
            const locationData = {
                latitude,
                longitude,
                roadAddress: '',
                jibunAddress: '',
                error: 'API Key not configured',
                timestamp: new Date().toISOString()
            };

            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'location_address',
                    data: locationData
                }));
            } else {
                console.log('Location data (no API key):', locationData);
            }
            return;
        }

        fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${longitude}&y=${latitude}`, {
            headers: {
                'Authorization': `KakaoAK ${REST_API_KEY}`
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.documents && data.documents.length > 0) {
                    const address = data.documents[0];
                    const locationData = {
                        latitude,
                        longitude,
                        roadAddress: address.road_address ? address.road_address.address_name : '',
                        jibunAddress: address.address ? address.address.address_name : '',
                        timestamp: new Date().toISOString()
                    };

                    // webview로 위치 및 주소 정보 전송
                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'location_address',
                            data: locationData
                        }));
                    } else {
                        console.log('Location address data:', locationData);
                    }
                } else {
                    // 주소 변환 실패 시에도 좌표 정보는 전송
                    const locationData = {
                        latitude,
                        longitude,
                        roadAddress: '',
                        jibunAddress: '',
                        error: '주소 변환 실패',
                        timestamp: new Date().toISOString()
                    };

                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'location_address',
                            data: locationData
                        }));
                    } else {
                        console.log('Location data (address failed):', locationData);
                    }
                }
            })
            .catch(error => {
                console.error('Address conversion error:', error);
                // 에러 발생 시에도 좌표 정보는 전송
                const locationData = {
                    latitude,
                    longitude,
                    roadAddress: '',
                    jibunAddress: '',
                    error: 'API 호출 실패',
                    timestamp: new Date().toISOString()
                };

                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'location_address',
                        data: locationData
                    }));
                } else {
                    console.log('Location data (API error):', locationData);
                }
            });
    };

    useEffect(() => {
        if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const { latitude, longitude, accuracy } = pos.coords;
                        const latlng = new window.kakao.maps.LatLng(latitude, longitude);
                        const container = document.getElementById('map');
                        const map = new window.kakao.maps.Map(container, { center: latlng, level: 3 });

                        mapRef.current = map;
                        initializeLocationTracking(map, refs, latitude, longitude, accuracy);

                        // 초기 위치의 주소 정보 가져오기
                        getAddressFromCoords(latitude, longitude);

                        setLoaded(true);

                        // 지도 이동 시 중심점의 주소 정보 업데이트
                        window.kakao.maps.event.addListener(map, 'dragend', () => {
                            const center = map.getCenter();
                            getAddressFromCoords(center.getLat(), center.getLng());
                        });
                    },
                    (err) => {
                        const errorData = {
                            error: true,
                            message: '위치 정보를 가져올 수 없습니다.',
                            code: err.code,
                            details: err.message
                        };

                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'location_error',
                                data: errorData
                            }));
                        } else {
                            alert('위치 정보를 가져올 수 없습니다.');
                            console.error(err);
                        }
                    },
                    { enableHighAccuracy: true }
                );
            });
        }

        return () => {
            if (refs.current.watchIdRef) {
                navigator.geolocation.clearWatch(refs.current.watchIdRef);
            }
        };
    }, []);

    // 내 위치로 이동 시 주소 정보도 업데이트
    const handleRecenterToMyLocation = () => {
        recenterToMyLocation(mapRef, refs);

        // 현재 위치의 주소 정보 다시 가져오기
        if (refs.current.lastLocationRef) {
            const { latitude, longitude } = refs.current.lastLocationRef;
            getAddressFromCoords(latitude, longitude);
        }
    };

    return (
        <Container>
            <MapElement id="map" />
            {loaded && (
                <LocateButton onClick={handleRecenterToMyLocation}>
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

const MapElement = styled.div`
    width: 100%;
    height: 100%;
`;

const LocateButton = styled.button`
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: white;
    border: none;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 24px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    z-index: 10;
    cursor: pointer;

    &:hover {
        background: #f5f5f5;
    }
`;

export default Location;