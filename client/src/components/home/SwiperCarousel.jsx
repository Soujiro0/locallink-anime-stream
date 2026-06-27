import { useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import AnimeCard from "../anime/AnimeCard";
import { ChevronLeft, ChevronRight } from "lucide-react";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/free-mode";

export default function SwiperCarousel({ title, anime = [], loading = false, renderItem }) {
  const prevRef = useRef(null);
  const nextRef = useRef(null);
  const [swiperInstance, setSwiperInstance] = useState(null);

  const isMobile = window.innerWidth < 768;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-7 w-48 rounded" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: isMobile ? 4 : 8 }).map((_, i) => (
            <div key={i} className="shrink-0 w-32 sm:w-36 lg:w-40">
              <div className="skeleton rounded-lg aspect-2/3" />
              <div className="mt-2 skeleton h-4 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!anime.length) return null;

  return (
    <div className="space-y-3 group/carousel relative">
      {/* Title */}
      <h2 className="text-xl lg:text-2xl font-bold text-text-primary px-1">
        {title}
      </h2>

      {/* Carousel wrapper */}
      <div className="relative">
        {/* Left scroll button */}
        <button
          ref={prevRef}
          onClick={() => swiperInstance?.slidePrev()}
          className="absolute left-0 top-1/2 -translate-y-1/2 -ml-3 z-20 w-10 h-10 rounded-full bg-surface-deep/90 border border-surface-border flex items-center justify-center text-white opacity-0 group-hover/carousel:opacity-100 disabled:opacity-0 transition-all hover:bg-netflix-red hover:border-netflix-red shadow-lg cursor-pointer"
          aria-label="Previous slides"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <Swiper
          modules={[Navigation, FreeMode]}
          onSwiper={setSwiperInstance}
          navigation={{
            prevEl: prevRef.current,
            nextEl: nextRef.current,
          }}
          onBeforeInit={(swiper) => {
            swiper.params.navigation.prevEl = prevRef.current;
            swiper.params.navigation.nextEl = nextRef.current;
          }}
          freeMode={true}
          slidesPerView="auto"
          spaceBetween={16}
          className="overflow-hidden! !py-1! rounded-lg"
        >
          {anime.map((item) => (
            <SwiperSlide key={item.id} className="w-auto! shrink-0 transition-transform duration-300">
              <div className="w-32 sm:w-36 lg:w-40">
                {renderItem ? renderItem(item) : <AnimeCard anime={item} />}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Right scroll button */}
        <button
          ref={nextRef}
          onClick={() => swiperInstance?.slideNext()}
          className="absolute right-0 top-1/2 -translate-y-1/2 -mr-3 z-20 w-10 h-10 rounded-full bg-surface-deep/90 border border-surface-border flex items-center justify-center text-white opacity-0 group-hover/carousel:opacity-100 disabled:opacity-0 transition-all hover:bg-netflix-red hover:border-netflix-red shadow-lg cursor-pointer"
          aria-label="Next slides"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
